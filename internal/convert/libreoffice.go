// Package convert turns office documents into editable HTML and back, by shelling
// out to a headless LibreOffice (soffice) on the host. It is used to let board
// members open uploaded Word files in the browser editor, save their edits back
// to the same file, and best-effort convert a PDF into an editable Word document.
//
// LibreOffice must be installed on the server (see the deploy workflow). When it
// is absent every entry point returns ErrUnavailable so callers can show a clear
// "not available on this server" message instead of a cryptic failure.
package convert

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// ErrUnavailable is returned when LibreOffice is not installed on the host.
var ErrUnavailable = errors.New("document editing is not available on this server yet")

// convertTimeout caps a single LibreOffice invocation. Conversions normally take
// a second or two; anything past this is a stuck process we'd rather kill.
const convertTimeout = 90 * time.Second

// sofficeBin locates the LibreOffice binary, or returns "" when it isn't installed.
func sofficeBin() string {
	for _, name := range []string{"soffice", "libreoffice"} {
		if p, err := exec.LookPath(name); err == nil {
			return p
		}
	}
	for _, p := range []string{"/usr/bin/soffice", "/usr/bin/libreoffice", "/opt/libreoffice/program/soffice"} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// Available reports whether conversions can run on this host.
func Available() bool { return sofficeBin() != "" }

// run performs one conversion of inputPath into target (a LibreOffice
// --convert-to spec, e.g. `docx:"MS Word 2007 XML"`). filterExt is the extension
// LibreOffice gives the produced file (e.g. "docx"). infilter, when non-empty,
// forces the import filter (e.g. "writer_pdf_import" to pull a PDF into Writer).
//
// The caller owns the returned file and must remove its parent directory when
// done. Each call gets a private user-profile directory so concurrent
// conversions don't collide on LibreOffice's single-instance lock.
func run(ctx context.Context, inputPath, target, filterExt, infilter string) (string, error) {
	bin := sofficeBin()
	if bin == "" {
		return "", ErrUnavailable
	}

	outDir, err := os.MkdirTemp("", "loconv-out-")
	if err != nil {
		return "", err
	}
	profile, err := os.MkdirTemp("", "loprofile-")
	if err != nil {
		os.RemoveAll(outDir)
		return "", err
	}
	defer os.RemoveAll(profile)

	ctx, cancel := context.WithTimeout(ctx, convertTimeout)
	defer cancel()

	args := []string{
		"--headless", "--norestore", "--nologo", "--nofirststartwizard",
		"-env:UserInstallation=file://" + profile,
	}
	if infilter != "" {
		args = append(args, "--infilter="+infilter)
	}
	args = append(args, "--convert-to", target, "--outdir", outDir, inputPath)

	cmd := exec.CommandContext(ctx, bin, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		os.RemoveAll(outDir)
		if ctx.Err() == context.DeadlineExceeded {
			return "", fmt.Errorf("conversion timed out")
		}
		return "", fmt.Errorf("conversion failed: %v: %s", err, strings.TrimSpace(string(out)))
	}

	// LibreOffice writes <input-basename>.<filterExt> into outDir.
	base := strings.TrimSuffix(filepath.Base(inputPath), filepath.Ext(inputPath))
	produced := filepath.Join(outDir, base+"."+filterExt)
	if _, err := os.Stat(produced); err != nil {
		os.RemoveAll(outDir)
		return "", fmt.Errorf("conversion produced no output (unsupported or corrupt file?)")
	}
	return produced, nil
}

// ToHTML converts an office document (Word, ODT, RTF, …) to an HTML string.
func ToHTML(ctx context.Context, inputPath string) (string, error) {
	produced, err := run(ctx, inputPath, "html", "html", "")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(filepath.Dir(produced))
	data, err := os.ReadFile(produced)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// docFilter maps a target file extension to the LibreOffice export filter used to
// produce it. Saving an edited document keeps it in its original format.
func docFilter(ext string) (target, filterExt string, ok bool) {
	switch strings.ToLower(strings.TrimPrefix(ext, ".")) {
	case "docx":
		return `docx:MS Word 2007 XML`, "docx", true
	case "doc":
		return `doc:MS Word 97`, "doc", true
	case "odt":
		return `odt:writer8`, "odt", true
	case "rtf":
		return `rtf:Rich Text Format`, "rtf", true
	}
	return "", "", false
}

// EditableExt reports whether a file extension can be opened in the editor.
func EditableExt(ext string) bool {
	_, _, ok := docFilter(ext)
	return ok
}

// FromHTML converts an HTML document into an office file of the given extension
// (one of the EditableExt set) and writes the bytes to outPath atomically.
func FromHTML(ctx context.Context, html, outPath string) error {
	target, filterExt, ok := docFilter(filepath.Ext(outPath))
	if !ok {
		return fmt.Errorf("cannot save to %s files", filepath.Ext(outPath))
	}

	srcDir, err := os.MkdirTemp("", "lohtml-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(srcDir)
	srcPath := filepath.Join(srcDir, "input.html")
	if err := os.WriteFile(srcPath, []byte(html), 0644); err != nil {
		return err
	}

	produced, err := run(ctx, srcPath, target, filterExt, "")
	if err != nil {
		return err
	}
	defer os.RemoveAll(filepath.Dir(produced))

	data, err := os.ReadFile(produced)
	if err != nil {
		return err
	}
	return writeAtomic(outPath, data)
}

// PDFToDocx imports a PDF into Writer and saves it as a .docx at outPath. Layout
// fidelity is best-effort — this is a convenience, not a faithful round-trip.
func PDFToDocx(ctx context.Context, inputPath, outPath string) error {
	produced, err := run(ctx, inputPath, `docx:MS Word 2007 XML`, "docx", "writer_pdf_import")
	if err != nil {
		return err
	}
	defer os.RemoveAll(filepath.Dir(produced))
	data, err := os.ReadFile(produced)
	if err != nil {
		return err
	}
	return writeAtomic(outPath, data)
}

// writeAtomic writes data to a sibling temp file in the destination directory and
// renames it into place, so a crashed or partial conversion can't leave a
// truncated file where the original used to be.
func writeAtomic(outPath string, data []byte) error {
	dir := filepath.Dir(outPath)
	tmp, err := os.CreateTemp(dir, ".convert-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, outPath); err != nil {
		os.Remove(tmpName)
		return err
	}
	return nil
}

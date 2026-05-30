package main
import (
    "fmt"
    "golang.org/x/crypto/bcrypt"
)
func main() {
    h, _ := bcrypt.GenerateFromPassword([]byte("LiveOaks2026!"), bcrypt.DefaultCost)
    fmt.Println(string(h))
}

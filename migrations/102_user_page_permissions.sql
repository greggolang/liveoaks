-- 102: per-member page access overrides, layered on top of role-based
-- page_permissions. allow = true grants a page even if the member's role
-- doesn't; allow = false hides a page the role would otherwise grant. Absence
-- of a row means "inherit from role".
CREATE TABLE IF NOT EXISTS user_page_permissions (
    user_id UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page    TEXT    NOT NULL,
    allow   BOOLEAN NOT NULL,
    PRIMARY KEY (user_id, page)
);

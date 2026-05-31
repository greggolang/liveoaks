-- Remove duplicate waitlist rows for the same person (matched by case-insensitive name).
-- Keeps the row with the most complete information. Ties broken by earliest created_at.
WITH scored AS (
    SELECT
        id,
        (CASE WHEN email           IS NOT NULL AND email           != '' THEN 1 ELSE 0 END +
         CASE WHEN phone           IS NOT NULL AND phone           != '' THEN 1 ELSE 0 END +
         CASE WHEN notes           IS NOT NULL AND notes           != '' THEN 1 ELSE 0 END +
         CASE WHEN usta_ranking    IS NOT NULL AND usta_ranking    != '' THEN 1 ELSE 0 END +
         CASE WHEN application_date IS NOT NULL                          THEN 1 ELSE 0 END) AS score,
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(first_name)), LOWER(TRIM(last_name))
            ORDER BY
                (CASE WHEN email           IS NOT NULL AND email           != '' THEN 1 ELSE 0 END +
                 CASE WHEN phone           IS NOT NULL AND phone           != '' THEN 1 ELSE 0 END +
                 CASE WHEN notes           IS NOT NULL AND notes           != '' THEN 1 ELSE 0 END +
                 CASE WHEN usta_ranking    IS NOT NULL AND usta_ranking    != '' THEN 1 ELSE 0 END +
                 CASE WHEN application_date IS NOT NULL                          THEN 1 ELSE 0 END) DESC,
                created_at ASC
        ) AS rn
    FROM waitlist
)
DELETE FROM waitlist
WHERE id IN (SELECT id FROM scored WHERE rn > 1);

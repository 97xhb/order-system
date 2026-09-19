UPDATE "share_forms"
SET "field_config" = "field_config" #- '{fields,platformAccount}'
WHERE "field_config" #> '{fields,platformAccount}' IS NOT NULL;

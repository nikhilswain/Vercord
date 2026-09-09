-- Existing JSON rows remain readable. New revisions store the document as gzip
-- alongside the allocation in the same atomic write, below D1's 2 MB row limit.
ALTER TABLE world_towns ADD COLUMN document_gzip BLOB;

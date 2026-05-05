INSERT INTO api.profiles (name, created_at)
VALUES ('Default', EXTRACT(EPOCH FROM NOW())::BIGINT);

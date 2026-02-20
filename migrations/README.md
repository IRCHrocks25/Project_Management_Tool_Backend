# Database Migrations

## Make Email Body Nullable

This migration makes the `body` column in the `emails` table nullable, allowing email logging without requiring a body field.

### To apply the migration:

**Option 1: Using the npm script (Recommended)**
```bash
cd backend
npm run migrate:email-body-nullable
```

**Option 2: Using the SQL script directly**
```bash
psql -d your_database_name -f migrations/make-email-body-nullable.sql
```

**Option 3: Manual SQL execution**
```sql
ALTER TABLE emails 
ALTER COLUMN body DROP NOT NULL;
```

### What this migration does:

- Makes the `body` column nullable in the `emails` table
- Allows creating email records without a body field
- Existing emails with body content remain unchanged

### Important:

**You must run this migration before the email logging feature will work.** The backend code expects the `body` column to be nullable. Without this migration, you'll get a 400 error when trying to log emails.


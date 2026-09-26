# Local admin provisioning

Public registration always creates a `STUDENT`. Use this one-time command only when you need an administrator in the disposable local Docker database for development or review:

```powershell
Set-Location 'C:\Users\irah jane\campus-queue\backend'
.\scripts\provision-local-admin.ps1
```

The PowerShell wrapper reads the disposable container's connection settings without displaying them, temporarily sets `DATABASE_URL` to `campus_queue_test` on `127.0.0.1:5433`, runs the prompt, and restores the previous `DATABASE_URL`. The inner command also refuses to run against a different host, port, or database. It asks for explicit confirmation, collects the password without echoing it, hashes it with bcrypt, and creates a new `ADMIN` user. It does not print or save the password, promote an existing account, or modify schema.

Sign in through the regular Campus Queue login page using the email and password entered in the terminal. Keep the password in a password manager; do not paste it into chat or commit it to the repository.

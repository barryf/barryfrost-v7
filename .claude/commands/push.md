---
name: push
description: Update PLAN.md, create atomic git commits, and push to GitHub
---

Review all uncommitted changes in the working tree, then:

1. Update `PLAN.md` to reflect any new features, removed features, changed URLs, or architectural decisions introduced by these changes. Keep it accurate and current — add, edit, or remove sections as needed.

2. Stage and commit the changes in logical atomic commits. Group related changes together (e.g. separate a config change from a content change). Write concise commit messages in the imperative mood that explain *why*, not just *what*. Use the format:
   ```
   git commit -m "$(cat <<'EOF'
   <message>

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   EOF
   )"
   ```

3. Push all commits to GitHub (`git push`).

Do not commit unrelated files. Do not amend existing commits. Do not skip hooks.

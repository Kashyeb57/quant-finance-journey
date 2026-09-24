# Publishing checklist

The website and the market Worker deploy separately from `main` through GitHub Actions. Both must succeed.

1. Checks pass locally: `npm run lint`, `npm test`, `npm run build`, `npm run check:build`, and `python -m unittest discover -s tests -v` in `brain/`.
2. After pushing, wait for **Deploy site**, **Deploy market worker** (runs the Worker tests before deploying) and **Test brain service**.
3. Verify the paused release:
   - `/brain` loads, with Brain under the Desk menu.
   - `/_m/brain/status` returns JSON with `"enabled": false`. Before any runner publishes, `report` is `null`.
   - Writes to `/_m/brain/control`, `/report`, `/order` and `/resolve` without the owner passphrase return 401.
4. No new secrets are needed: the Worker reuses its existing Alpaca paper secrets, owner passphrase and `NOTES_DB` binding, and creates its own tables on first use. Nothing trades because of a deployment; automation starts disabled.
5. Then follow [README.md](README.md): collect longer history, train, observe, and publish observation. Paper orders come last and only after the research gate passes.

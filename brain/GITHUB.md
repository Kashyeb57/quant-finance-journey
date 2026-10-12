# Run Brain through GitHub

GitHub Actions evaluates the frozen SATS setup-outcome model for MU and publishes current observations while your computer is off. SATS identifies a setup; simple and fly-informed readouts predict its subsequent net basis points after costs. The workflow never retrains the readouts and cannot place orders for this strategy.

Standard GitHub-hosted runners are free for this public repository. Do not select larger runners or change the repository to private without checking your allowance. See [GitHub billing](https://docs.github.com/en/actions/concepts/billing-and-usage).

## One-time setup

1. Publish the `Run Brain` workflow, Python code, encrypted `deployment/sats-model.fernet` and website/Worker changes. Wait for **Deploy site**, **Deploy market worker** and **Test brain service** to pass.
2. In the GitHub repository, open **Settings → Secrets and variables → Actions → Secrets** and add:

   | Secret | Value |
   |---|---|
   | `BRAIN_MODEL_KEY` | The single line in the locally generated `brain/runtime/github-model.key` file |
   | `BRAIN_OWNER_TOKEN` | The existing website owner passphrase, entered privately |

   The owner enters these privately. Never paste them into an issue, a commit, a workflow input or a chat. Do not add the key file to Git. The encrypted SATS bundle contains fitted readouts, graph, evaluation, provenance and immutable historical seed bars. It contains no brokerage credentials or decision database. Raw seed bars and fitted parameters are never published as plaintext.
3. Stop any local publishing or paper runner so only GitHub publishes the report.
4. Open **Actions → Run Brain → Run workflow**, select **main**, and run once. The first run defaults to observation. It must finish green and the website must show **GitHub scheduled reports**, the correct MU model id and a recent timestamp.
5. Under **Settings → Secrets and variables → Actions → Variables**, add `BRAIN_SCHEDULE_ENABLED` with the exact value `true`. Scheduled execution is opt-in; until this exists, automatic jobs are skipped. Leave `BRAIN_RUN_MODE` unset or set it to `observe`. A value of `paper` makes the SATS job fail before secrets are read or data is downloaded.
6. Close the local terminal. Future scheduled runs take place on GitHub. Confirm another report arrives while the local runner is stopped; the website shows the last receipt time in CT.

The current SATS snapshot is MU model `a4df9760250e34c1`, pipeline `sats-setup-net-bps-v1`. It fitted 53 earlier completed setup outcomes. Fresh September 25–October 2 testing had only two eligible setups: SATS alone lost $7.46 on two trades; simple and fly filters each lost $3.13 on one trade and made the same choices. No fly advantage is established. Its research gate fails and `paper_ready` stays false. The site includes this frozen comparison before a scheduled report arrives, labeled as saved research. A weekend job can correctly report Friday's last completed bar as stale.

## Schedule, starting and stopping

The workflow is scheduled at minutes **02, 17, 32 and 47**, every weekday from **13:00 through 21:59 UTC**, covering the US market session in both seasons. It uses completed 15-minute bars with the existing 60-second settlement delay. Every job performs one cycle and exits; jobs are serialized and limited to 12 minutes. The model is not retrained on each run.

- To start automatic reports, set `BRAIN_SCHEDULE_ENABLED=true`.
- To stop future automatic reports, set it to `false` or use **Actions → Run Brain → … → Disable workflow**. A job already running may finish; cancel it in Actions if needed. A manual **Run workflow** intentionally runs once even if the schedule variable is false.
- To see a failed or skipped job, open **Actions → Run Brain**. A failed publication makes the job fail. No reports or model files are uploaded as public Actions artifacts.
- A stored “GitHub scheduled reports” label identifies where the last report came from. It does not prove a schedule is still enabled. Always read the timestamp and the Actions results.

GitHub says scheduled jobs can be **delayed or dropped**, and public-repository schedules can be disabled after **60 days without repository activity**. This setup is suitable for scheduled research and observation; it cannot guarantee intraday entry or exit deadlines. Do not use artificial commits to defeat GitHub's inactivity rules. See [the schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Paper execution remains separate

The workflow fixes `BRAIN_STRATEGY=sats-learning`. This strategy only supports `observe`: its execution target is always zero and it never requests controls or orders. Python and the website backend independently reject SATS paper mode or execution, including a forged passed gate. Changing a variable cannot enable SATS trading. TradingView parity, more unseen evidence and an adapter for its hypothetical protective orders require a separate verified release first. GitHub never changes the owner's existing automation switch.

Queued or dropped jobs can miss entries and the scheduled exit. A GitHub-only schedule is not a guarantee that a position will close on time. Keep the current unqualified model in observation. Pausing on the website blocks new orders, including exits; it does not liquidate or cancel anything. Before stopping a future paper schedule, pause and manage its paper positions as described in the README.

The authoritative order claims and reconciliation ledger remain in the existing Cloudflare D1 database. GitHub's local decision log is disposable; deleting a job workspace does not reset the Worker's order claims.

## Updating the model

After a separately evaluated new model has been trained locally, install the packaging dependency and export the snapshot from `brain/`:

```text
python -m pip install -r requirements-github.txt
python -m joyeb_brain.deployment --strategy sats-learning
```

This writes authenticated encrypted `deployment/sats-model.fernet` and creates `runtime/github-model.key` only if absent. It reuses the existing key on later exports and preserves the original `deployment/model.fernet`. Commit only encrypted bundles and reviewed code. Never print the key or commit `runtime/`. A lost key requires private recovery, or replacing the bundle and GitHub secret together.

The SATS snapshot permits exactly six files: `models.npz`, `evaluation.json`, `graph.npz`, `graph.json`, `data.json` and `seed.csv`. Validation checks per-file digests, frozen settings/features, finite coefficients and positive scales, graph dimensions/hashes, model/report identity, training boundary and genuine seed byte digest before restoring files or opening the simulator. Wrong keys, corrupt data, extra files or incompatible artifacts fail clearly.

Every run downloads the full interval from the immutable seed through now, with overlap. Seed rows win over later revisions; completed later bars extend its recursive indicator state. A download that does not bridge the seed fails. The endpoint has a 365-day limit, so a separately validated seed refresh is needed before that limit is reached. Current forecasts never rewrite the original evaluation. A seed refresh must retain frozen training identities and parameters.

The public report omits fitted readout parameters. The original fly snapshot remains usable by the optional local runner and explicit `legacy` Python selector; the published workflow selects SATS.

The workflow runs only from this repository's main branch, has read-only repository permissions, does not keep the checkout credential and receives the two secrets only in its execution step. Treat changes to this workflow or its Python entry point as changes to trusted code before publishing them.

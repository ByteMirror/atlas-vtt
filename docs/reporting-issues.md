# Reporting issues

## For players and game masters

Inside Obsidian, run the **Report an issue** command (open the command palette
with `Ctrl/Cmd+P` and type "report") or open **Settings → Atlas VTT → Help and
feedback**. The form asks for:

- the kind of issue (bug, crash, slow, plugin conflict, feature request, question),
- the part of Atlas affected,
- a title, what happened, and steps to reproduce.

Atlas fills in the rest: its own version, the Obsidian and Electron versions,
your operating system, interface language and theme, the names and versions of
your enabled community plugins (toggle), and the last Atlas error messages from
this session (toggle). Open the *Environment details* section to see exactly
what will be sent. Nothing about your vault, files or notes is included.

**Open GitHub issue** opens a pre-filled issue form in your browser. Nothing is
sent until you submit it there with your own GitHub account. If you have no
account, **Copy report** puts a Markdown version on the clipboard that you can
send another way.

Reports that are too long for a link are copied to the clipboard automatically,
and Atlas tells you which sections to paste into the form.

## How it stays safe

Atlas never talks to GitHub itself. There is no token in the plugin, no
proxy service and no anonymous posting, so there is nothing to abuse or leak.
Submission happens through GitHub's own issue forms, which require a GitHub
account and are covered by GitHub's rate limits and spam protection. The
repository disables blank issues, so every report uses a form, and security
problems have a private channel through GitHub's vulnerability reporting.

## For maintainers

- `.github/ISSUE_TEMPLATE/bug_report.yml` and `feature_request.yml` are the
  forms. Their dropdown options must match `src/app/support/issueCategories.ts`;
  `tests/unit/issueTemplates.test.ts` fails otherwise.
- New issues receive `needs-triage`. The **Issue Triage** workflow reads the
  form answers and adds `type:*` and `area:*` labels using the patterns in
  `.github/issue-labeler.yml`. It only adds labels, so a manual re-triage
  survives later edits. It runs with issue-write permission only and executes
  no user content.
- The plugin pre-fills form fields through URL query parameters keyed by the
  field ids in the templates. Renaming an id in a template requires the same
  change in `src/app/support/issueReport.ts`.

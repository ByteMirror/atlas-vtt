# Issue reporting service

Creates issues for reports submitted from Atlas. The service preserves the
selected type and affected area, validates report fields, applies category
labels, and returns an issue receipt.

The plugin does not contain a GitHub credential. Reports are submitted only
when the player chooses **Submit report**. See [the privacy policy](../../PRIVACY.md)
for what is sent and retained.

The service shares category definitions with the plugin in
`src/app/support/issueCategories.json`.

## Tests

```sh
python3 -m unittest discover -s services/issue-reporter
```

Tests use temporary databases and a local HTTP server; they do not create
GitHub issues.

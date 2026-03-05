name: fetch

on:
  schedule:
    - cron: '15 6 * * *'  # Diari 06:15 UTC (~07:15 CET)
  workflow_dispatch: {}
  push:
    paths:
      - 'fetch.mjs'
      - '.github/workflows/fetch.yml'
      - 'data/**'

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Fetch dataset and build snapshot
        run: node fetch.mjs
        env:
          DAYS_BACK: '21'

      - name: Commit snapshot (built-in git, no 3rd-party action)
        run: |
          if [[ -n "$(git status --porcelain data/today.json)" ]]; then
            git config user.name "github-actions[bot]"
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
            git add data/today.json
            git commit -m "chore(data): update snapshot"
            git push
          else
            echo "No changes to commit"
          fi

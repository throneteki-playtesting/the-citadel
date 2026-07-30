# Contributing to The Citadel

Thanks for taking an interest. This is a small, volunteer-run project — issues, ideas and pull requests are
all welcome.

The fastest way to reach the maintainers is the
[throneteki playtesting Discord](https://discord.gg/xekB6uq6Hx). If you are planning anything larger than a
bug fix, raise it there or in an issue first so we can agree on the approach before you spend time on it.

## Getting set up

See [Getting started](README.md#getting-started) in the README. Note that the app has no local-only login
mode — you need a Discord application of your own to sign in during development.

## Branches and pull requests

- Branch off `master`.
- Keep a pull request to one concern. A rename, a refactor and a feature in one branch is three reviews
  pretending to be one.
- Say what you changed and why in the description, and how you verified it. Screenshots help for UI work.
- Run `npm run lint` and `npm run format:check` before opening the PR.

## Code style

Two tools split the work: **Prettier formats, ESLint checks.**

```bash
npm run format          # apply formatting
npm run format:check    # verify without changing anything
npm run lint            # ESLint across server and client
```

Both should pass before you open a pull request.

If you use VS Code, install the [recommended extensions](.vscode/extensions.json) when prompted and this is
handled on save — no need to run anything by hand.

### What Prettier decides

Indentation, line breaks, quote marks, spacing and trailing commas are Prettier's, configured in
[`.prettierrc`](.prettierrc). Don't hand-tune them and don't argue with them in review; run `npm run format`
and move on. If you're adding an ESLint rule, make sure it isn't about formatting — rules that overlap with
Prettier fight it on every save.

### What you still have to get right

ESLint ([`eslint.config.js`](eslint.config.js)) catches unused variables, `prefer-const`, React hook misuse
and similar. A few conventions it can't check for you:

- **Always brace `if` statements**, across multiple lines:

    ```ts
    // yes
    if (!card) {
        return;
    }

    // no
    if (!card) return;
    ```

- **Compose class names with `classNames()`**, not template literals.
- **Put shared types and models in [`common/`](common/)**, imported through the `common/*` path alias, so
  client and server stay in agreement.
- **Restructure rather than suppress.** Reach for `eslint-disable` only when there's genuinely no alternative,
  and leave a comment saying why.
- **Comment the non-obvious.** Explain surprising behaviour or a constraint that isn't visible from the code.
  Skip JSDoc blocks that restate the signature, notes about what you changed (that's what the commit message
  is for), and commented-out code.

## Project layout

The [Architecture table](README.md#architecture) in the README explains what lives where. Two things worth
knowing up front:

- `client/` and `server/` are independent npm projects, not a workspace. Dependencies must be installed in
  each one separately.
- `common/` is shared by TypeScript path alias, not by package link, so changes there affect both sides
  immediately with no rebuild.

## Database migrations

Schema changes go in [`migration/`](migration/) as a numbered script, alongside the code change that needs
them. Migrations are tracked in a `_migrations` collection and are expected to be safe to run against a
populated database.

## Reporting bugs

Open a [GitHub issue](https://github.com/throneteki-playtesting/the-citadel/issues) with what you did, what
you expected, and what happened instead — including the browser and whether you were signed in. In-app, the
bug report button takes you straight to the Discord channel, which is fine too.

Please don't file public issues for security problems. Message a maintainer on Discord directly instead.

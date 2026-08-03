# Заметки по форку (strokovdmitriy-beep/claude-mem)

Этот файл — не часть апстрима, трогать `git merge upstream/main` не должен. Сюда пишем всё, что касается именно нашего форка: зачем он, что в нём изменено сверх апстрима, какие грабли уже нашли и как их обходить.

**Апстрим**: https://github.com/thedotmack/claude-mem
**Наш форк**: https://github.com/strokovdmitriy-beep/claude-mem
**Remotes в этом чекауте**: `origin` → форк, `upstream` → апстрим.

Подробный разбор альтернатив (mem0, agentmemory, OpenViking, beads, MemPalace-скам) и почему решили остаться на этом форке — в личном Harness.md (`Documents/dsmade Vault/⚙️Настройки/Harness.md`), раздел «Claude mem». Здесь — только то, что касается работы с самим кодом.

## Зачем форк

Дефолтный установщик кладёт клон апстрима в `~/.claude/plugins/marketplaces/thedotmack` с `autoUpdate: true` — свои правки поверх него рисковали затиранием при следующем автообновлении. Форк даёт держать правки под контролем и переносить на новую машину одной командой (переключить `known_marketplaces.json` на свой репозиторий).

## Наши изменения (сверх апстрима, самое новое сверху)

### 2026-07-25 — Fix opencode-plugin capture + перевод панели Settings
Коммиты: `dff91c18`, `8adfe331`

- **`src/integrations/opencode-plugin/`**: opencode-плагин не грузился в реальном OpenCode вообще — бандл экспортировал не только функцию плагина, но и два служебных массива (`REAL_OPENCODE_EVENT_TYPES`, `REGISTERED_OPENCODE_HOOKS`), а загрузчик OpenCode требует, чтобы каждый экспорт модуля был функцией (подтверждено реверс-инжинирингом `app.asar` самого OpenCode). Добавлена отдельная точка входа `plugin-entry.ts`, которая отдаёт наружу только функции; `index.ts` остаётся входом для тестов, которым нужны эти массивы.
- Там же: `ctx.project` в реальном API OpenCode не имеет поля `name` (только `id`/`directory`) — проект вычислялся неправильно, все сессии писались под литеральным именем `"opencode"`. Теперь берём basename от `ctx.directory`.
- Сессии из opencode всегда слали `prompt: ""` (хук `chat.message` игнорировал `role: "user"`) — отсюда `[media prompt]` в дашборде и невозможность семантической инъекции памяти (там жёсткое требование ≥20 символов реального промпта). Починено.
- Ни один запрос не слал `platformSource` — все opencode-сессии помечались как `platform_source: claude`. Добавлено `platformSource: "opencode"` во все вызовы.
- Добавлен хук `experimental.chat.system.transform` — единственный способ для OpenCode получить авто-инъекцию памяти в начало чата (аналог `SessionStart` у Claude Code, которого у OpenCode-плагинов нет).
- `scripts/build-hooks.js`: точка сборки opencode-плагина переключена на `plugin-entry.ts`.
- `src/ui/viewer/components/ContextSettingsModal.tsx`, `TerminalPreview.tsx`, `hooks/useContextPreview.ts`: панель Settings дашборда (`localhost:37701`) переведена на русский. Ключи настроек (`CLAUDE_MEM_*`) и CSS-классы не тронуты.
- Добавлены/обновлены тесты в `tests/integrations/opencode-plugin-contract.test.ts` под все фиксы выше (10/10 зелёных).

## Известные проблемы и обходные пути (не баги форка — баги апстрима/окружения)

### Циклический рестарт воркера («restart storm»)
Симптом: воркер падает и пересоздаётся каждые ~10–15 сек, хуки в Claude Code видят `worker unreachable for N consecutive hooks` и **блокируют промпт**.

Причина: `~/.claude/plugins/cache/thedotmack/claude-mem/<version>/` — это отдельная, версионированная копия плагина, которую реально загружает Claude Code (через `--plugin-dir`), отдельно от `~/.claude/plugins/marketplaces/thedotmack` (наш форк/чекаут). Если в `cache/` осталась старая версия, а в `marketplaces/` (наш форк) — новая, логика ресайкла видит рассинхрон и убивает/пересоздаёт воркер бесконечно, потому что при рестарте выбирает всё ту же старую cache-директорию (в её коде эта проблема уже когда-то была пофикшена: см. комментарий про «2026-07-22 restart storm» в `src/shared/worker-utils.ts`, но для нашей *старой* cache-копии фикс ещё не проехал).

**Фикс** (не патч кода — просто держать кэш в актуальном состоянии): скопировать текущий `plugin/` из нашего форка в новую, правильно пронумерованную директорию `~/.claude/plugins/cache/thedotmack/claude-mem/<текущая версия>/`, взяв `node_modules` (нативные tree-sitter-биндинги и т.п.) из старой версии, а не пересобирая с нуля. Резолвер выбирает самую свежую версию по имени директории — подхватывает сам, без перезапуска Claude Code.

```bash
SRC=~/.claude/plugins/cache/thedotmack/claude-mem/<старая-версия>
DST=~/.claude/plugins/cache/thedotmack/claude-mem/<новая-версия>
MP=~/.claude/plugins/marketplaces/thedotmack/plugin
cp -R "$SRC" "$DST"
for item in scripts hooks ui skills modes .mcp.json package.json .claude-plugin .codex-plugin sqlite bun.lock; do
  rm -rf "$DST/$item"; cp -R "$MP/$item" "$DST/$item"
done
python3 -c "import json; p='$DST/.install-version'; d=json.load(open(p)); d['version']='<новая-версия>'; json.dump(d, open(p,'w'))"
```

### OpenRouter free tier — суточный лимит, не поминутный
`CLAUDE_MEM_OPENROUTER_MODEL` в `~/.claude-mem/settings.json` использует бесплатную модель через OpenRouter. Лимит **50 запросов/день** (не rate-per-minute) без депозита; ошибка в логе: `Rate limit exceeded: free-models-per-day`. `openai/gpt-oss-20b:free` — рабочая замена сгоревшей `xiaomi/mimo-v2-flash:free` (та вообще снята с OpenRouter, 404). Депозит $10 на OpenRouter поднимает лимит до 1000/день.

### Codex: `plugin_hooks` не работает — тупик, не чинится на нашей стороне
Приложение Codex (десктоп ChatGPT, проверено на `0.146.0-alpha.3.1`) в `codex features list` показывает `plugin_hooks: removed, false` — хуки от плагинов физически не долетают, реальным `codex exec` подтверждено (0 события за несколько прогонов). Это не специфика claude-mem: тот же путь (`[features] plugin_hooks = true` в `config.toml`) использует и OpenViking, и результат идентичный — 0 захвата. Ждём фикса от OpenAI, на своей стороне обходного пути нет (сессии Codex не читаются даже через альтернативный transcript-watcher — актуальный формат `~/.codex/sessions/*.jsonl` изменился, `payload.type` теперь `"message"` с полем `role`, а не старый формат `"user_message"`, под который написана `transcript-watch.example.json`).

## Как обновляться из апстрима

```bash
cd ~/.claude/plugins/marketplaces/thedotmack
git fetch upstream
git merge upstream/main   # конфликты — руками
git push origin main
```

После мержа: если конфликт в `plugin/ui/viewer-bundle.js` или `dist/opencode-plugin/index.js` — это собранные файлы, не мержить руками, пересобрать (`node scripts/build-viewer.js` для UI, `node scripts/build-hooks.js` для остального). После `build-hooks.js` — `git status` и `git checkout --` откатить `plugin/scripts/*.cjs`, если наши правки их не касались (это шум от другой версии локального тулчейна, не реальные изменения).

Апстрим обновляется часто (~раз в 2–3 дня по CHANGELOG.md) — подтягивать раз в 1–2 недели, чтобы не копился разрыв.

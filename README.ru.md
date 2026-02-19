# antigravity-context-mcp

Два часа кодишь с агентом. Фича почти готова. Ты в потоке.

Контекст переполняется. Сессия падает.

Открываешь новый чат. Агент смотрит на тебя как в первый раз. *«Привет! Чем могу помочь?»*

**Этот MCP-сервер делает так, чтобы этого не происходило.**

Агент сам вспомнит, на чём остановились. Сам сохранит важное из разговора. Сам найдёт нужное из прошлых сессий. Тебе ничего делать не надо.

---

## Установка

Открой чат Antigravity и отправь ссылку на этот репозиторий:

> *«установи этот MCP-сервер: https://github.com/eglebov133-sudo/antigravity-context-mcp»*

Перезапусти Antigravity — готово.

<details>
<summary>Ручная установка</summary>

```bash
git clone https://github.com/eglebov133-sudo/antigravity-context-mcp.git
cd antigravity-context-mcp
npm install
```

Добавить в `~/.gemini/antigravity/mcp_config.json`:

```json
{
  "mcpServers": {
    "context": {
      "command": "node",
      "args": ["/путь/до/antigravity-context-mcp/server.js"]
    }
  }
}
```

Перезапустить Antigravity.

</details>

## Безопасность

- Локально через stdio — никаких открытых портов
- Только чтение по умолчанию — пишет только когда нужно
- Пароли на твоей машине, исключены из Git
- Ноль телеметрии, ноль внешних запросов

## Требования

- Node.js 18+
- Antigravity

## Лицензия

MIT

---

*Сделано потому, что мы устали представляться собственному AI-агенту.*

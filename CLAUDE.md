# CLAUDE.md — Real-estate Backend (Project Hub)

> Trang điều phối. Chỉ trỏ tới kiến thức, agent, skill, playbook — **không chứa nội dung chi tiết**.
> Hệ thống viết mới theo microservices: api-gateway + 5 service NestJS (identity, listing, rental, payment, notification), mỗi service copy từ `services/_template-nest`.
> **Báo cáo v2 là nguồn chuẩn**, sau đó tới code đã merge, rồi tài liệu khác (`project-knowledge/business-spec/README.md`). Nguồn lệch nhau thì đưa cho người phụ trách quyết định (`project-knowledge/implementation/van-de-can-quyet-dinh.md`).
>
> Quy tắc **MUST / NEVER** ở **§8** có độ ưu tiên cao nhất, ghi đè hành vi mặc định.

---

## §1 — Quy chuẩn chung (`project-knowledge/standards/`)

> Nguồn sự thật cho **cách làm**. Thiết kế và code tham chiếu tới đây, không chép lại giá trị.

### Luôn nạp

@./project-knowledge/standards/security-policy.md
@./project-knowledge/standards/git-workflow.md
@./project-knowledge/standards/gotchas.md

### Đọc khi cần

| File | Đọc khi |
|---|---|
| `standards/coding-convention.md` | Trước khi **thiết kế / viết / review** code NestJS, gateway, `_template-nest` |
| `standards/api-convention.md` | Khi **thiết kế / viết** endpoint: đường dẫn, status code, envelope, mã lỗi, header |
| `standards/reliability-standard.md` | Khi viết **lời gọi liên service** hoặc payOS, health check, timeout, retry |
| `standards/non-functional-standards.md` | Khi **thiết kế / viết / review** API trả danh sách, truy vấn DB, tác vụ dài (ngưỡng số truy vấn, phân trang, index) |
| `standards/design-standards.md` | Khi **sinh hoặc review** tài liệu thiết kế (`solution-architect`, `architect-reviewer`) |

---

## §2 — Kiến thức dự án (`project-knowledge/`)

@./project-knowledge/CLAUDE.md

---

## §3 — Agents · Coordinator tự thực thi

> Định tuyến chi tiết: `.claude/AGENTS.md` (đọc khi cần). Repo này **chỉ chứa backend** (api-gateway + 5 service + `_template-nest`); giao diện Next.js ở repo riêng (https://github.com/dotrungthanhCC01/real-estate).

| Request | MUST thực thi procedure | NEVER |
|---|---|---|
| Thiết kế từ spec / đề bài (API, luồng, class — **chưa code**) | `solution-architect` (`.claude/agents/solution-architect.md`) | Code thẳng |
| Review **tài liệu thiết kế** trước khi code | `architect-reviewer` (`.claude/agents/architect-reviewer.md`) | Tự sửa tài liệu khi review |
| Implement / viết / tạo / sửa code production | `developer` (`.claude/agents/developer.md`) | Viết tự do ngoài procedure |
| Review code / chuẩn bị PR | `code-reviewer` (`.claude/agents/code-reviewer.md`) | Bỏ chiều review nào |

> Coordinator **tự đọc file procedure và làm inline**, không bảo user chuyển agent.
> Chuỗi đầy đủ cho chức năng mới: `solution-architect` → `architect-reviewer` → `developer` → `code-reviewer`.

---

## §4 — Skills (`.claude/skills/`, tự phát hiện)

| Skill | Dùng khi |
|---|---|
| `task-state-init` | Bắt đầu implement một task (§8) |
| `progress-tracker` | Sau mỗi bước implement xong (§8) |
| `technical-design` | Sinh tài liệu thiết kế từ spec |
| `reuse-scan` | Trước khi tạo thành phần dùng chung mới — quét cái đã có (§8) |
| `code-review` | Review nhanh 5 chiều trước commit |
| `debug` | Gỡ lỗi có hệ thống 4 bước |
| `decisions-relevance` | Rà kho ADR: lỗi thời, mồ côi, mâu thuẫn |
| `tdd-workflow` | Áp chu trình Red → Green → Refactor khi playbook TDD bật (§5) |
| `contract-change` | Đổi API nội bộ hoặc sự kiện — sửa `contracts/` trước code, chạy `pnpm contracts:check` (§8) |
| `service-scaffold` | Tạo service mới từ `services/_template-nest` và nối vào compose, gateway |
| `code-walkthrough` | Task có code đã xanh — viết `guides/RE_<Thành_phần>_Code_Walkthrough.md` trước `code-review` (§8) |

---

## §5 — Playbooks

> Bật/tắt **chỉ ở một nơi**: `.claude/playbooks.json`. Claude chỉ áp dụng playbook có `enabled: true`; hook tự đọc file này để chọn mức `monitor-only` | `warn` | `block`.

| Playbook | Tài liệu (đọc khi bật) | Hook |
|---|---|---|
| `tdd` | `project-knowledge/playbooks/tdd/tdd-guide.md` + skill `tdd-workflow` | `project-knowledge/playbooks/tdd/tdd-guard.js` (PostToolUse) |

---

## §6 — Hooks (`.claude/settings.json`)

- **PostToolUse** (`Write|Edit|MultiEdit`) → `tdd-guard.js`: sửa file `.ts` trong `services/*/src/` mà chưa có `.spec.ts` cạnh nó thì nhắc (`warn`) hoặc chặn (`block`). Chỉ chạy khi `playbooks.tdd.enabled = true`. Lỗi nội bộ thì cho qua.
- **permissions**: `allow` các lệnh chỉ đọc hoặc kiểm tra (`pnpm lint`, `format:check`, `build`, `contracts:check`, `pnpm --filter @realestate/<service> test*` và `build`, `git status/diff/log`); `ask` trước `git commit/push/merge`, `pnpm add/install`, xóa volume, sửa `.env`; `deny` đọc/sửa `secrets/`, `*.pem`, `*.key`, `git push --force`, `git reset --hard`, `rm -rf`. Cấu hình riêng từng máy để ở `.claude/settings.local.json` (không commit).
- Chưa có hook quét secret. Quy tắc tương ứng vẫn bắt buộc theo `standards/security-policy.md`.

---

## §7 — Trạng thái task & bàn giao phiên

Nguồn chính của task là `project-knowledge/implementation/` (task, hạn theo mốc M0–M5, DoD, `progress.md` tick sau merge).
`.claude/state/<dev-id>/` chỉ giữ việc **đang làm dở** của từng người:

```
.claude/state/
├─ _template/            # khung chuẩn, copy khi dev bắt đầu task đầu tiên
└─ <dev-id>/
   ├─ current-task.md    # task đang làm: DoD, kế hoạch chi tiết, Reuse Report (ghi đè)
   ├─ progress.md        # tiến độ task hiện tại
   ├─ tech-debt.md       # nợ kỹ thuật phát sinh
   ├─ decisions-log.md   # quyết định nhẹ trong phiên (khác ADR)
   └─ session-handoff.md # snapshot bàn giao phiên gần nhất (ghi đè)
```

- `<dev-id>` = phần trước `@` của `git config user.email`, chữ thường, ký tự ngoài `[a-z0-9._-]` đổi thành `-`; rỗng thì `local-dev`.
- `/cf-task T<x.y>` nhận task: đọc `PHASE-x.md`, kiểm phụ thuộc, `task-state-init`, vào `developer` tới cổng duyệt kế hoạch.
- `/cf-status` xem task đang làm, phase trễ, việc đang chặn, task nên nhận tiếp (chỉ đọc).
- `/cf-handoff` lưu phiên đang dở; `/cf-resume` đọc lại và **hỏi trước khi code tiếp**.
- `.claude/logs/` (log hook) và `.claude/settings.local.json` nằm trong `.gitignore`, không commit.

---

## §8 — MUST / NEVER (ưu tiên cao nhất)

### MUST

- **MUST** theo thứ tự nguồn khi thiết kế, code, review: Báo cáo v2 → code đã merge (`services/identity`, `services/_template-nest`, `infra/`) → tài liệu khác (`business-spec/README.md`).
- Thấy các nguồn lệch nhau, hoặc thiết kế lệch Báo cáo v2 không có lý do: **MUST** ghi vào `project-knowledge/implementation/van-de-can-quyet-dinh.md` và báo người phụ trách, kèm phương án và đề xuất. Chưa có quyết định thì làm theo Báo cáo v2.
- Nhận "thiết kế / đặc tả [X]" chưa yêu cầu code: **MUST** chạy `solution-architect`, ghi tài liệu vào `project-knowledge/design/<CỤM>/<MÃ>/`. Không nhảy sang `task-state-init` hay `developer`.
- Chức năng **đã có** `design/<CỤM>/<MÃ>/`: **MUST** đọc và bám thiết kế. Muốn lệch thì **sửa tài liệu trước** (sau baseline thì kèm `CHANGELOG.md`, tăng phiên bản — `standards/design-standards.md §9`), rồi mới sửa code.
- Nhận "implement / tạo / viết / sửa code [X]": **MUST** chạy `task-state-init` trước khi viết dòng code nào. Task phải ứng với một mục trong `implementation/PHASE-x.md`; không có thì hỏi user (task ngoài kế hoạch cần A đồng ý).
- **MUST** viết code production qua procedure `developer`.
- Bước 2 của `developer`: **MUST** ghi kế hoạch chi tiết (file sẽ sửa + bước con) vào `current-task.md` và trình user duyệt — **một cổng duyệt duy nhất** trước khi viết code.
- **MUST** tuân thủ mọi playbook đang bật trong `.claude/playbooks.json`. TDD bật thì viết test trước.
- Trước khi tạo **thành phần dùng chung mới** (util, helper, mapper, guard, decorator, client, hằng, enum, hàm lặp lại được): **MUST** chạy `reuse-scan`, ghi Reuse Report vào `current-task.md`.
- Đổi API nội bộ hoặc sự kiện: **MUST** sửa `contracts/` trước code và chạy `pnpm contracts:check` (ADR-0012).
- Thiết kế hoặc viết endpoint, truy vấn DB: **MUST** bám ngưỡng ở `standards/non-functional-standards.md §1` từ lúc lập kế hoạch. Không đạt được thì **DỪNG**, nêu nguyên nhân, chờ user xác nhận.
- Viết lời gọi liên service: **MUST** dùng `InternalHttpService` qua `clients/`, cấu hình theo `standards/reliability-standard.md`.
- Sau khi viết hoặc sửa code: **MUST** chạy lại test liên quan và thấy **tất cả PASS** (dán output) trước khi gọi `progress-tracker` hay tick DoD.
- Sau mỗi bước implement xong: **MUST** chạy `progress-tracker`.
- Trước khi commit: **MUST** chạy `code-review` đủ 5 chiều.
- Nhận "lỗi / không chạy / debug": **MUST** theo 4 bước của `debug`; chưa tái hiện được thì không đoán nguyên nhân.
- Chỗ chưa rõ: **MUST** ghi `[cần xác nhận]` tại chỗ và gom ở cuối tài liệu.
- Số liệu thí nghiệm, báo cáo: **MUST** đo thật.
- Implement xong một task có code (test và lệnh kiểm chứng đã PASS): **MUST** viết file giải thích code `project-knowledge/guides/RE_<Thành_phần>_Code_Walkthrough.md` trước khi `code-review` và commit, rồi thêm một dòng trỏ tới nó ở `project-knowledge/CLAUDE.md §2.5`. Khuôn và mức chi tiết theo `guides/_template_Code_Walkthrough.md`: luồng chung + cây thư mục, chức năng **từng file** (kể cả cấu hình, test, Dockerfile, compose), lý do của các quyết định không hiển nhiên, câu hỏi vấn đáp, hạn chế đã biết. Task sửa thành phần đã có file giải thích → **cập nhật** file đó, không tạo file mới.

### NEVER

- **NEVER** tự đổi một hành vi đang có trong code đã merge hoặc trái Báo cáo v2 (kể cả để "đúng chuẩn"), tự thêm luật hay mã lỗi mà thiết kế không có. Đó là quyết định của người phụ trách.
- **NEVER** xếp hành vi giữ nguyên từ code đã merge vào CRITICAL / MAJOR hay coi là chặn code.
- **NEVER** viết code production ngoài procedure `developer`.
- **NEVER** coi yêu cầu "thiết kế" là lệnh implement.
- **NEVER** bỏ qua `task-state-init` khi bắt đầu một task.
- **NEVER** đảo hoặc bỏ quy trình của playbook đang bật vì "nhanh hơn". Hai playbook mâu thuẫn thì dừng, hỏi user.
- **NEVER** commit khi chưa qua `code-review` 5 chiều.
- **NEVER** tạo thành phần dùng chung mới khi chưa có Reuse Report, kể cả khi "chắc chắn chưa có".
- **NEVER** viết bản song song của thứ đã có trong `services/_template-nest`; cần khác thì sửa template trước rồi chép sang service (ADR-0014, PR do A duyệt).
- **NEVER** import entity hay code nghiệp vụ của service khác, kết nối database của service khác, gọi `fetch`/`axios` trực tiếp.
- **NEVER** vượt ngưỡng số truy vấn rồi giải trình sau khi code xong.
- **NEVER** tick DoD hoặc đổi `status: done` khi test chưa chạy hoặc còn fail.
- **NEVER** đoán hợp đồng của service khác — đọc `API_Spec.md` của service đó và `contracts/`; chưa có thì `[cần xác nhận]`.
- **NEVER** đưa secret vào repo. Giá trị thật chỉ ở `.env` (đã ignore); repo chỉ có `.env.example`.
- **NEVER** để thiết kế, kế hoạch, Reuse Report chỉ nằm trong chat — phải ghi vào file.
- **NEVER** điền số ước lượng vào báo cáo thí nghiệm.
- **NEVER** `@import` tài liệu theo tình huống vào `project-knowledge/CLAUDE.md` — chỉ `@` file cần ở mọi phiên.
- Mọi task giao cho A (chốt 2026-11-18); người được A giao lại: **NEVER** sửa ngoài phạm vi task được giao (`implementation/README.md §2`).

### BEFORE / AFTER

- BEFORE thiết kế hoặc code một chức năng: đọc phần Báo cáo v2 tương ứng qua `business-spec/RE.BUSINESS_RULES.md`, `business-spec/RE.SRS.md`, và code đã có trong `services/`.
- BEFORE thiết kế: đọc `standards/design-standards.md` + `api-convention.md` + `coding-convention.md` + `reliability-standard.md` + `non-functional-standards.md` + thiết kế liên quan đã có.
- BEFORE viết code: đọc `architecture.md §3, §6` + `standards/coding-convention.md §1–3` + thiết kế của chức năng.
- BEFORE tạo thành phần dùng chung: chạy `reuse-scan` trên **source hiện tại** (`services/_template-nest/src`, `services/*/src`, `services/api-gateway/src`), không dựa danh sách viết tay trong tài liệu.
- BEFORE review: đọc `standards/security-policy.md` + `non-functional-standards.md §1`.
- AFTER mỗi bước implement: tick `current-task.md` → `progress-tracker`. AFTER merge: tick `implementation/progress.md`.
- AFTER test và kiểm chứng PASS, BEFORE `code-review`: viết hoặc cập nhật `guides/RE_<Thành_phần>_Code_Walkthrough.md` (§8 MUST).

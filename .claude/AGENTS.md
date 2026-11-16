# AGENTS.md — Định tuyến và thực thi procedure

> Phiên Claude mặc định là **coordinator**. Khi request khớp một nhánh dưới đây, coordinator **tự đọc file procedure và làm inline**, không yêu cầu user chuyển agent.
> File agent là quy trình bắt buộc, không phải phiên UI riêng.
> Repo này chỉ chứa backend (`api-gateway` + 5 service NestJS, mỗi service copy từ `services/_template-nest`), nên không tách biến thể BE/FE. Giao diện Next.js ở repo riêng (https://github.com/dotrungthanhCC01/real-estate).

## §1 — Cây quyết định

```
Nhận request
│
├── Thiết kế từ spec / đề bài (API, luồng, class — CHƯA code)
│   └── MUST procedure `solution-architect`   (.claude/agents/solution-architect.md)
│
├── Review TÀI LIỆU THIẾT KẾ
│   └── MUST procedure `architect-reviewer`   (.claude/agents/architect-reviewer.md)
│
├── Viết / implement / tạo / sửa code production, migration, contracts, Dockerfile, compose
│   └── MUST procedure `developer`            (.claude/agents/developer.md)
│
├── Review code / chuẩn bị PR
│   └── MUST procedure `code-reviewer`        (.claude/agents/code-reviewer.md)
│
└── Hỏi đáp / giải thích / tìm kiếm / sửa tài liệu không phải thiết kế
    └── Xử lý trực tiếp
```

> Tầng thiết kế đứng **trước** tầng code. "Thiết kế [X]" ≠ "implement [X]".
> Sửa `project-knowledge/design/**` cũng là thiết kế → `solution-architect` (kèm `CHANGELOG.md`).

## §2 — Tóm tắt từng procedure

### `solution-architect`

- **Trigger:** "thiết kế [X]", "đặc tả API", "design luồng / class", "sửa thiết kế [X]".
- **Làm:** đọc `business-spec/`, `architecture.md`, `standards/*`, thiết kế liên quan → sinh hoặc sửa bộ 3 tài liệu trong `design/<CỤM>/<MÃ>/` → chạy bộ kiểm tuân thủ `design-standards.md §3.1` → ghi ADR `Proposed` nếu có quyết định lớn.
- **Không:** viết code `src/`.

### `architect-reviewer`

- **Trigger:** "review thiết kế", "soi design", "kiểm tra đặc tả".
- **Làm:** soi 6 nhóm (đầy đủ, nhất quán, tuân thủ chuẩn, khả thi và rủi ro, súc tích, ADR) → gọi `decisions-relevance` → output CRITICAL / MAJOR / MINOR.
- **Không:** tự sửa tài liệu hay ADR.

### `developer`

- **Trigger:** "implement", "viết", "tạo", "build", "thêm tính năng", "làm task T<x.y>", "sửa code".
- **Làm:** `task-state-init` → đọc context (thiết kế, kiến trúc, quy chuẩn, hợp đồng, playbook) → `reuse-scan` → ghi kế hoạch chi tiết và **chờ duyệt** → (`contract-change` nếu đổi hợp đồng, `service-scaffold` nếu tạo service) → code + test theo playbook → chạy test, dán output → `progress-tracker` sau mỗi bước → `code-walkthrough` → `code-review`.
- **Lối vào nhanh:** `/cf-task T<x.y>`.
- **Không:** cài thư viện ngoài `architecture.md §5` khi chưa được duyệt; tick DoD khi test chưa xanh.

### `code-reviewer`

- **Trigger:** "review code", "check code", "chuẩn bị PR", "trước khi merge".
- **Làm:** 5 chiều Security, Performance, Correctness, Style, Reuse + ranh giới service → CRITICAL / MAJOR / MINOR kèm gợi ý sửa.

## §3 — Xử lý trực tiếp hay không

| Loại request | Trực tiếp? |
|---|---|
| Giải thích code, tìm kiếm, tra cứu, tóm tắt | Có |
| Đọc log, phân tích lỗi | Có, nhưng gỡ lỗi phải theo skill `debug` |
| Sửa tài liệu ngoài `design/` (guide, standards, implementation) | Có, giữ khuôn `design-standards.md` |
| Thiết kế, sửa thiết kế | Không — `solution-architect` |
| Review thiết kế | Không — `architect-reviewer` |
| Viết, sửa code production | Không — `developer` |
| Review trước merge | Không — `code-reviewer` |

## §4 — Cách thực thi

1. Báo ngắn đang chạy procedure nào: "Bắt đầu `developer` — Bước 1: đọc context…".
2. Đọc file procedure trong `.claude/agents/<tên>.md` lúc cần, không nạp sẵn.
3. Làm tuần tự từng bước, không nhảy bước.
4. Sau mỗi bước implement: `progress-tracker`.

**NEVER** bảo user chuyển agent, **NEVER** bỏ bước vì "nhanh hơn".

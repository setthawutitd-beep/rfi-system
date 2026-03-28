# RFI System — TTT Land Reclamation

ระบบจัดการ RFI (Request for Inspection) สำหรับโครงการก่อสร้าง  
Stack: **React + Vite + TypeScript + Supabase + Cloudflare Pages**

---

## 🚀 Quick Start

### 1. ติดตั้ง Dependencies

```bash
cd rfi-system
npm install
```

### 2. ตั้งค่า Supabase

**2.1 สร้าง Project ใหม่ที่ [supabase.com](https://supabase.com)**

**2.2 รัน Schema SQL**
- ไปที่ Dashboard → SQL Editor
- Copy เนื้อหาจาก `supabase/schema.sql` แล้ว Run

**2.3 สร้าง Storage Bucket**
- ไปที่ Dashboard → Storage
- สร้าง bucket ชื่อ `rfi-attachments` (Private)

**2.4 สร้าง Demo Users** ใน Dashboard → Authentication → Users:
```
contractor@ttt.co.th  / password123  → role: contractor
qc@ttt.co.th          / password123  → role: qc
consultant@ttt.co.th  / password123  → role: consultant
pm@ttt.co.th          / password123  → role: pm
```
> หมายเหตุ: ตอนสร้าง user ให้ใส่ metadata `{"name": "ชื่อ", "role": "qc"}` ด้วย

**2.5 Copy API Keys**
- ไปที่ Settings → API
- Copy `Project URL` และ `anon public key`

### 3. ตั้งค่า Environment

```bash
cp .env.local.example .env.local
```

แก้ไข `.env.local`:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

### 4. รัน Dev Server

```bash
npm run dev
```

เปิด http://localhost:5173

---

## 🏗 Build & Deploy

### Build

```bash
npm run build
```
→ สร้างไฟล์ใน `dist/`

### Deploy บน Cloudflare Pages (แนะนำ — ฟรี)

**วิธีที่ 1: Git (Auto Deploy)**
1. Push โค้ดขึ้น GitHub
2. ไปที่ [pages.cloudflare.com](https://pages.cloudflare.com)
3. Connect GitHub repo
4. Build settings:
   - Build command: `npm run build`
   - Build output: `dist`
5. Environment Variables: ใส่ `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY`
6. Deploy!

**วิธีที่ 2: CLI**
```bash
npm install -g wrangler
wrangler pages publish dist --project-name rfi-system
```

### Deploy บน Netlify (ทางเลือก)

```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

---

## 📁 โครงสร้างโปรเจกต์

```
rfi-system/
├── src/
│   ├── components/
│   │   ├── LoginPage.tsx      ← หน้า Login
│   │   ├── Sidebar.tsx        ← Navigation + Role Switcher
│   │   ├── Dashboard.tsx      ← KPI + Charts + Overdue
│   │   ├── RFIList.tsx        ← ตารางรายการ RFI + Filters
│   │   ├── RFIModal.tsx       ← Detail Modal + Actions + Comments
│   │   ├── CreateForm.tsx     ← Wizard 4 Steps สร้าง RFI
│   │   ├── MyQueue.tsx        ← คิวตาม Role
│   │   ├── History.tsx        ← Audit Trail ทั้งหมด
│   │   ├── Calendar.tsx       ← ปฏิทินนัดตรวจ
│   │   ├── Settings.tsx       ← ตั้งค่าระบบ
│   │   ├── NotifPanel.tsx     ← Panel การแจ้งเตือน
│   │   └── Toast.tsx          ← Toast Notifications
│   ├── lib/
│   │   └── supabase.ts        ← Supabase Client + Query Helpers
│   ├── hooks/
│   │   └── useRFI.ts          ← State Management + Realtime
│   ├── types/
│   │   └── rfi.ts             ← TypeScript Types + Constants
│   ├── styles/
│   │   └── global.css         ← Global CSS (clone ธีมเดิม 100%)
│   ├── App.tsx                ← Root Component
│   └── main.tsx               ← Entry Point
├── supabase/
│   └── schema.sql             ← DDL + RLS Policies + Triggers
├── public/
│   └── _redirects             ← Cloudflare/Netlify SPA routing
├── .env.local.example
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## ⚡ Realtime Features

ระบบใช้ Supabase Realtime Subscriptions:

| Event | Trigger | ผล |
|-------|---------|-----|
| RFI status เปลี่ยน | UPDATE on `rfis` | ทุก client เห็นทันที |
| Comment ใหม่ | INSERT on `rfi_comments` | เห็นใน Modal ทันที |
| History ใหม่ | INSERT on `rfi_history` | Timeline อัปเดต |
| Notification | INSERT on `notifications` | ไอคอนระฆังกระพริบ |

---

## 🔐 Role & Permissions

| Role | สร้าง RFI | Approve/Reject | Close |
|------|-----------|----------------|-------|
| Contractor | ✅ | ❌ (Re-submit เท่านั้น) | ❌ |
| QC | ❌ | ✅ (QC + Re-submit) | ❌ |
| Consultant | ❌ | ✅ (Consult step) | ❌ |
| PM | ❌ | ❌ | ✅ |

---

## 🔄 Workflow

```
Open → QC L1 → Consultant L2 → Site Inspection → PM Verify → Closed
                    ↕ Reject → Re-submit ↗
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript |
| Build Tool | Vite 5 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (Email/Password) |
| Realtime | Supabase Realtime (WebSocket) |
| File Storage | Supabase Storage |
| Hosting | Cloudflare Pages (ฟรี) |

---

## 📝 Notes

- **Supabase Free Tier**: 500MB DB, 1GB Storage, 50K MAU — เพียงพอสำหรับโครงการ
- **Cloudflare Pages**: Unlimited requests, 500 builds/month — ฟรีตลอด
- **TypeScript strict mode** เปิดอยู่ — ช่วย catch bugs ก่อน build

# SmartSpend API Specification

Dokumen ini merupakan spesifikasi API untuk project **SmartSpend (Pencatat Keuangan Keluarga dengan Scan Struk dan Batas Pengeluaran Adaptif)** yang dibangun menggunakan **NestJS**.

Dokumen ini dapat digunakan sebagai acuan antara backend, mobile application, dan layanan OCR/ML.

---

## 1. Gambaran Project

### Nama Project

**SmartSpend API**

### Tujuan

Membantu keluarga mengatur pengeluaran bulanan dengan batas yang **dihitung dari profil kebutuhan keluarga** (jumlah anggota, cicilan, tagihan tetap), bukan dari persentase gaji yang seragam. Pengeluaran dicatat manual atau lewat scan struk, dikelompokkan otomatis menjadi primer, sekunder, dan tersier, dan pengguna diberi peringatan saat jatah pengeluaran tersier mendekati batas.

### Teknologi

- Node.js
- NestJS
- REST API
- JSON
- JWT Authentication
- Swagger / OpenAPI
- Class Validator
- PostgreSQL (database)
- Cloud Object Storage (foto struk)
- Layanan OCR/ML terpisah (misalnya Python/FastAPI) yang dipanggil oleh backend NestJS

### Base URL

```text
/api/v1
```

Contoh:

```text
http://localhost:3000/api/v1
```

---

# 2. Konsep API

API menggunakan format JSON.

### Konvensi Data

| Jenis data | Konvensi |
|---|---|
| Uang | Integer dalam Rupiah, tanpa desimal (contoh: `150000`) |
| Tanggal dan waktu | ISO 8601, UTC (contoh: `2026-11-10T09:00:00Z`) |
| Periode bulanan | String `YYYY-MM` (contoh: `2026-11`) |
| ID | String berprefiks pada contoh (`usr_001`, `fam_001`); implementasi dapat memakai UUID |
| Berat emas | Number dalam gram (contoh: `6.5`) |

## Success Response

Contoh response ketika request berhasil:

```json
{
  "success": true,
  "message": "Transaction retrieved successfully",
  "data": {}
}
```

## Error Response

Contoh response ketika terjadi error:

```json
{
  "success": false,
  "message": "Transaction not found",
  "error": "Not Found",
  "statusCode": 404
}
```

---

# 3. HTTP Status Code

| Status Code | Keterangan |
|---|---|
| `200` | Request berhasil |
| `201` | Data berhasil dibuat |
| `202` | Request diterima dan sedang diproses (scan struk) |
| `204` | Berhasil tanpa response body |
| `400` | Request tidak valid |
| `401` | Belum login atau token tidak valid |
| `403` | Tidak memiliki permission (misalnya anggota mengakses data penghasilan) |
| `404` | Data tidak ditemukan |
| `409` | Terjadi conflict (misalnya sudah menjadi anggota keluarga) |
| `413` | Ukuran file terlalu besar |
| `415` | Format file tidak didukung |
| `422` | Validation error |
| `500` | Internal server error |

---

# 4. Authentication dan Role

Authentication menggunakan **Bearer Token (JWT)**.

Setiap endpoint yang membutuhkan authentication harus mengirimkan header:

```http
Authorization: Bearer {accessToken}
```

Contoh:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Role dalam Keluarga

Setiap user yang tergabung dalam keluarga memiliki satu role. Role menentukan data yang boleh dilihat (RBAC).

| Role | Keterangan |
|---|---|
| `manager` | Pengelola utama. Membuat keluarga dan mengelola semua data |
| `partner` | Pasangan. Hak hampir sama dengan manager, kecuali mengelola anggota (tahap 2) |
| `member` | Anggota (misalnya anak). Hanya melihat jatah dan riwayat pribadi |

### Matriks Akses

| Data / Aksi | manager | partner | member |
|---|:---:|:---:|:---:|
| Lihat penghasilan | Ya | Ya | Tidak |
| Lihat aset (emas) | Ya | Ya | Tidak |
| Lihat laporan keluarga | Ya | Ya | Tidak |
| Catat transaksi | Ya | Ya | Ya (masuk ke jatahnya) |
| Lihat jatah dan riwayat pribadi | Ya | Ya | Ya |
| Ubah profil keuangan, kategori, batas | Ya | Ya | Tidak |
| Undang / hapus anggota | Ya | Tidak | Tidak |

Percobaan akses ke data yang tidak diizinkan mengembalikan `403 Forbidden`.

---

# 5. Authentication API

## 5.1 Register

Mendaftarkan user baru.

### Endpoint

```http
POST /api/v1/auth/register
```

### Request Body

```json
{
  "name": "Siti Aminah",
  "email": "siti@example.com",
  "password": "password123",
  "passwordConfirmation": "password123"
}
```

### Response

**HTTP 201 Created**

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "usr_001",
      "name": "Siti Aminah",
      "email": "siti@example.com"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

## 5.2 Login

Login user ke dalam aplikasi.

### Endpoint

```http
POST /api/v1/auth/login
```

### Request Body

```json
{
  "email": "siti@example.com",
  "password": "password123"
}
```

### Response

**HTTP 200 OK**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "usr_001",
      "name": "Siti Aminah",
      "email": "siti@example.com",
      "familyId": "fam_001",
      "role": "manager"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

`familyId` dan `role` bernilai `null` jika user belum tergabung dalam keluarga.

---

## 5.3 Logout

Logout user.

### Endpoint

```http
POST /api/v1/auth/logout
```

### Headers

```http
Authorization: Bearer {accessToken}
```

### Response

```json
{
  "success": true,
  "message": "Logout successful"
}
```

---

## 5.4 Get Current User

```http
GET /api/v1/auth/me
```

Mengembalikan data user yang sedang login beserta `familyId` dan `role`.

---

# 6. Family API

Keluarga adalah "buku keuangan" bersama. Semua data keuangan (transaksi, profil, aset) milik keluarga, bukan milik satu user.

## 6.1 Create Family

Membuat keluarga baru. User pembuat otomatis menjadi `manager`.

### Endpoint

```http
POST /api/v1/families
```

### Request Body

```json
{
  "name": "Keluarga Aminah"
}
```

### Response

**HTTP 201 Created**

```json
{
  "success": true,
  "message": "Family created successfully",
  "data": {
    "id": "fam_001",
    "name": "Keluarga Aminah",
    "role": "manager"
  }
}
```

---

## 6.2 Generate Invite Code

Hanya `manager`. Kode berlaku terbatas waktu.

### Endpoint

```http
POST /api/v1/families/:familyId/invitations
```

### Request Body

```json
{
  "role": "member"
}
```

### Response

```json
{
  "success": true,
  "message": "Invitation created successfully",
  "data": {
    "code": "SMART-7K2P9",
    "role": "member",
    "expiresAt": "2026-11-17T09:00:00Z"
  }
}
```

---

## 6.3 Join Family

### Endpoint

```http
POST /api/v1/families/join
```

### Request Body

```json
{
  "code": "SMART-7K2P9"
}
```

### Response

```json
{
  "success": true,
  "message": "Joined family successfully",
  "data": {
    "familyId": "fam_001",
    "role": "member"
  }
}
```

Error `409 Conflict` apabila user sudah tergabung dalam keluarga, dan `404` apabila kode tidak valid atau kedaluwarsa.

---

## 6.4 Get Family Members

### Endpoint

```http
GET /api/v1/families/:familyId/members
```

### Response

```json
{
  "success": true,
  "message": "Members retrieved successfully",
  "data": [
    { "userId": "usr_001", "name": "Siti Aminah", "role": "manager" },
    { "userId": "usr_002", "name": "Rafi", "role": "member", "monthlyAllowance": 300000 }
  ]
}
```

`monthlyAllowance` hanya ditampilkan kepada `manager` dan `partner`.

---

## 6.5 Update Member Role dan Remove Member

```http
PATCH  /api/v1/families/:familyId/members/:userId
DELETE /api/v1/families/:familyId/members/:userId
```

Hanya `manager`. Manager tidak dapat menghapus dirinya sendiri selama masih ada anggota lain.

---

# 7. Financial Profile API

Profil keuangan adalah **dasar perhitungan batas pengeluaran**. Hanya `manager` dan `partner` yang dapat mengakses.

## 7.1 Get Financial Profile

### Endpoint

```http
GET /api/v1/families/:familyId/profile?period=2026-11
```

### Response

```json
{
  "success": true,
  "message": "Financial profile retrieved successfully",
  "data": {
    "period": "2026-11",
    "monthlyIncome": 3000000,
    "householdSize": 2,
    "foodCostPerPersonMonthly": 600000,
    "savingsTargetPercent": 10,
    "obligations": [
      { "id": "obl_001", "name": "Listrik", "amount": 250000, "type": "utility" }
    ]
  }
}
```

---

## 7.2 Set Monthly Income dan Profil

### Endpoint

```http
PUT /api/v1/families/:familyId/profile
```

### Request Body

```json
{
  "period": "2026-11",
  "monthlyIncome": 3000000,
  "householdSize": 2,
  "foodCostPerPersonMonthly": 600000,
  "savingsTargetPercent": 10
}
```

Penghasilan diinput **per bulan** karena dapat berubah. Jika periode belum diisi, sistem dapat menyalin nilai dari bulan sebelumnya sebagai nilai awal.

---

## 7.3 Obligations (Kewajiban Tetap)

Kewajiban tetap adalah pengeluaran rutin yang jumlahnya relatif pasti, misalnya cicilan, listrik, air, uang sekolah, dan iuran.

### Endpoint

```http
GET    /api/v1/families/:familyId/obligations
POST   /api/v1/families/:familyId/obligations
PATCH  /api/v1/families/:familyId/obligations/:id
DELETE /api/v1/families/:familyId/obligations/:id
```

### Request Body (Create)

```json
{
  "name": "Cicilan Mobil",
  "amount": 2500000,
  "type": "installment",
  "dueDay": 5
}
```

### Nilai `type`

| Type | Contoh |
|---|---|
| `installment` | Cicilan mobil, motor, KPR |
| `utility` | Listrik, air, internet |
| `education` | Uang sekolah |
| `other` | Iuran, arisan, lainnya |

---

# 8. Category API

Setiap transaksi masuk ke kategori, dan setiap kategori memiliki **kelompok kebutuhan**.

| Group | Keterangan | Contoh |
|---|---|---|
| `primary` | Kebutuhan primer | Beras, lauk, listrik, air, cicilan |
| `secondary` | Kebutuhan sekunder | Pakaian, transport tambahan, perawatan rumah |
| `tertiary` | Tersier / foya-foya | Jajan, hiburan, rokok, barang keinginan |

## 8.1 Get Categories

```http
GET /api/v1/categories
```

### Response

```json
{
  "success": true,
  "message": "Categories retrieved successfully",
  "data": [
    { "id": "cat_001", "name": "Sembako", "group": "primary" },
    { "id": "cat_002", "name": "Pakaian", "group": "secondary" },
    { "id": "cat_003", "name": "Jajan", "group": "tertiary" }
  ]
}
```

## 8.2 Create, Update, Delete Category

```http
POST   /api/v1/categories
PATCH  /api/v1/categories/:id
DELETE /api/v1/categories/:id
```

Kategori bawaan sistem tidak dapat dihapus. Kategori buatan keluarga hanya terlihat oleh keluarga tersebut.

---

# 9. Transaction API

Transaksi adalah data utama pengeluaran. Sebuah transaksi memiliki:

- Jumlah
- Kategori (dan kelompok)
- Tanggal
- Catatan
- Pencatat (user)
- Sumber (`manual` atau `receipt`)
- Daftar item (jika berasal dari struk)

## 9.1 Get Transactions

Mengambil daftar transaksi.

### Endpoint

```http
GET /api/v1/transactions
```

### Query Parameters

| Parameter | Type | Required | Keterangan |
|---|---|---|---|
| `page` | integer | No | Nomor halaman |
| `limit` | integer | No | Jumlah data |
| `search` | string | No | Pencarian catatan atau nama item |
| `categoryId` | string | No | Filter kategori |
| `group` | string | No | Filter `primary`, `secondary`, `tertiary` |
| `startDate` | date | No | Tanggal mulai |
| `endDate` | date | No | Tanggal selesai |
| `userId` | string | No | Filter pencatat (hanya manager/partner) |

`member` hanya menerima transaksi yang ia catat sendiri, apa pun filter yang dikirim.

### Contoh Request

```http
GET /api/v1/transactions?page=1&limit=10&group=tertiary&startDate=2026-11-01
```

### Response

```json
{
  "success": true,
  "message": "Transactions retrieved successfully",
  "data": [
    {
      "id": "trx_001",
      "amount": 25000,
      "note": "Jajan bakso",
      "date": "2026-11-10T12:30:00Z",
      "source": "manual",
      "category": { "id": "cat_003", "name": "Jajan", "group": "tertiary" },
      "createdBy": { "id": "usr_002", "name": "Rafi" }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

---

## 9.2 Get Transaction Detail

### Endpoint

```http
GET /api/v1/transactions/:id
```

Jika transaksi berasal dari struk, response menyertakan `items` dan `receiptId`.

### Response

```json
{
  "success": true,
  "message": "Transaction retrieved successfully",
  "data": {
    "id": "trx_010",
    "amount": 150000,
    "source": "receipt",
    "receiptId": "rcp_001",
    "date": "2026-11-10T10:15:00Z",
    "items": [
      { "name": "Beras 5Kg", "price": 68000, "category": { "id": "cat_001", "group": "primary" } },
      { "name": "Cokelat", "price": 12000, "category": { "id": "cat_003", "group": "tertiary" } }
    ]
  }
}
```

---

## 9.3 Create Transaction (Manual)

### Endpoint

```http
POST /api/v1/transactions
```

### Request Body

```json
{
  "amount": 25000,
  "categoryId": "cat_003",
  "date": "2026-11-10T12:30:00Z",
  "note": "Jajan bakso"
}
```

### Response

**HTTP 201 Created**

```json
{
  "success": true,
  "message": "Transaction created successfully",
  "data": {
    "id": "trx_001",
    "amount": 25000,
    "alert": null
  }
}
```

Field `alert` terisi apabila transaksi ini membuat pengeluaran melewati ambang peringatan (lihat bagian Budget dan Alert).

---

## 9.4 Update dan Delete Transaction

```http
PATCH  /api/v1/transactions/:id
DELETE /api/v1/transactions/:id
```

`member` hanya boleh mengubah atau menghapus transaksi miliknya. `manager` dan `partner` dapat mengelola semua transaksi keluarga.

> `PATCH` digunakan karena hanya field yang ingin diubah yang perlu dikirimkan.

---

# 10. Receipt Scan API

Scan struk bersifat **asynchronous** karena OCR dan klasifikasi membutuhkan waktu. Alurnya:

```text
1. Upload foto struk          -> status: processing
2. Backend: preprocessing citra, OCR, klasifikasi item
3. Cek hasil scan             -> status: needs_review
4. User koreksi dan konfirmasi -> status: confirmed (transaksi dibuat)
```

Jika OCR gagal, status menjadi `failed` dan user diarahkan ke input manual.

## 10.1 Upload Receipt

### Endpoint

```http
POST /api/v1/receipts
Content-Type: multipart/form-data
```

### Form Data

| Field | Type | Required | Keterangan |
|---|---|---|---|
| `image` | file | Yes | JPG atau PNG, maksimal 5 MB |
| `date` | date | No | Tanggal belanja jika diketahui |

### Response

**HTTP 202 Accepted**

```json
{
  "success": true,
  "message": "Receipt is being processed",
  "data": {
    "id": "rcp_001",
    "status": "processing"
  }
}
```

---

## 10.2 Get Receipt Result

### Endpoint

```http
GET /api/v1/receipts/:id
```

### Response

```json
{
  "success": true,
  "message": "Receipt retrieved successfully",
  "data": {
    "id": "rcp_001",
    "status": "needs_review",
    "merchant": "Indomaret",
    "date": "2026-11-10T10:15:00Z",
    "total": 150000,
    "items": [
      { "name": "Beras 5Kg", "price": 68000, "categoryId": "cat_001", "confidence": 0.93 },
      { "name": "Cokelat", "price": 12000, "categoryId": "cat_003", "confidence": 0.71 }
    ]
  }
}
```

`confidence` membantu aplikasi mobile menandai item yang perlu diperiksa user.

---

## 10.3 Confirm Receipt

User mengoreksi hasil scan lalu mengonfirmasi. Sistem membuat transaksi dari item yang sudah dikoreksi.

### Endpoint

```http
POST /api/v1/receipts/:id/confirm
```

### Request Body

```json
{
  "date": "2026-11-10T10:15:00Z",
  "items": [
    { "name": "Beras 5Kg", "price": 68000, "categoryId": "cat_001" },
    { "name": "Cokelat", "price": 12000, "categoryId": "cat_003" }
  ]
}
```

### Response

**HTTP 201 Created**

```json
{
  "success": true,
  "message": "Receipt confirmed and transaction created",
  "data": {
    "transactionId": "trx_010",
    "alert": {
      "level": "warning",
      "message": "Pengeluaran foya-foya sudah mencapai 75% dari jatah bulan ini"
    }
  }
}
```

Koreksi kategori dari user disimpan sebagai data untuk memperbaiki model klasifikasi.

---

# 11. Budget API (Batas Pengeluaran Adaptif)

Ini adalah **inti pembeda SmartSpend**. Batas pengeluaran tidak dihitung dari persentase gaji yang seragam, tetapi dari profil kebutuhan keluarga.

### Rumus

```text
Penghasilan bulan ini
- Kewajiban tetap (cicilan, listrik, uang sekolah, dll)
- Kebutuhan makan (jumlah anggota x biaya makan per orang)
- Target tabungan (persen dari penghasilan)
= Sisa fleksibel
```

**Jatah foya-foya (tersier)** diambil dari sisa fleksibel, bukan dari total gaji. Sisa fleksibel yang bernilai nol atau negatif berarti keluarga sudah defisit sebelum belanja tambahan.

### Contoh Dua Keluarga

| | Keluarga A | Keluarga B |
|---|---|---|
| Penghasilan | 10.000.000 | 3.000.000 |
| Anggota | 9 orang | 2 orang |
| Kewajiban tetap | 4.000.000 (cicilan mobil dll) | 400.000 |
| Biaya makan | 5.400.000 | 1.200.000 |
| Tabungan 10% | 1.000.000 | 300.000 |
| **Sisa fleksibel** | **-400.000** | **1.100.000** |

Keluarga A bergaji lebih besar tetapi sisa fleksibelnya negatif, sedangkan keluarga B yang bergaji kecil masih punya ruang. Batas persentase seragam tidak dapat menangkap perbedaan ini.

## 11.1 Get Current Budget

### Endpoint

```http
GET /api/v1/budgets/current?period=2026-11
```

Hanya `manager` dan `partner`.

### Response

```json
{
  "success": true,
  "message": "Budget retrieved successfully",
  "data": {
    "period": "2026-11",
    "income": 3000000,
    "fixedObligations": 400000,
    "foodBudget": 1200000,
    "savingsTarget": 300000,
    "flexibleBudget": 1100000,
    "spending": {
      "primary": 1450000,
      "secondary": 200000,
      "tertiary": 650000
    },
    "tertiaryUsedPercent": 59,
    "remainingFlexible": 450000,
    "status": "safe"
  }
}
```

### Nilai `status`

| Status | Kondisi pemakaian sisa fleksibel | Arti |
|---|---|---|
| `safe` | di bawah 70% | Aman |
| `warning` | 70% sampai di bawah 90% | Waspada |
| `critical` | 90% sampai di bawah 100% | Hampir habis |
| `exceeded` | 100% atau lebih | Sudah melebihi batas |

Ambang 70 dan 90 adalah nilai awal dan dapat dibuat bisa diatur oleh `manager`.

---

## 11.2 Update Budget Settings

### Endpoint

```http
PATCH /api/v1/budgets/settings
```

### Request Body

```json
{
  "warningThresholdPercent": 70,
  "criticalThresholdPercent": 90
}
```

---

# 12. Member Allowance API (Jatah Anggota)

Anggota berperan `member` tidak melihat data keluarga. Mereka hanya diberi **jatah pribadi**.

## 12.1 Set Allowance

Hanya `manager` dan `partner`.

### Endpoint

```http
PUT /api/v1/families/:familyId/members/:userId/allowance
```

### Request Body

```json
{
  "period": "2026-11",
  "amount": 300000
}
```

## 12.2 Get My Allowance

Dapat diakses semua role.

### Endpoint

```http
GET /api/v1/me/allowance?period=2026-11
```

### Response

```json
{
  "success": true,
  "message": "Allowance retrieved successfully",
  "data": {
    "period": "2026-11",
    "amount": 300000,
    "used": 210000,
    "remaining": 90000,
    "usedPercent": 70,
    "status": "warning"
  }
}
```

Response ini tidak memuat penghasilan, aset, atau data anggota lain.

---

# 13. Alert API

Peringatan dibuat otomatis saat transaksi baru membuat pemakaian melewati ambang tertentu.

## 13.1 Get Alerts

### Endpoint

```http
GET /api/v1/alerts?unread=true
```

### Response

```json
{
  "success": true,
  "message": "Alerts retrieved successfully",
  "data": [
    {
      "id": "alr_001",
      "type": "tertiary_limit",
      "level": "warning",
      "message": "Pengeluaran foya-foya sudah mencapai 75% dari jatah bulan ini. Harap lebih berhati-hati dalam berbelanja.",
      "isRead": false,
      "createdAt": "2026-11-10T10:16:00Z"
    }
  ]
}
```

### Nilai `type`

| Type | Keterangan |
|---|---|
| `tertiary_limit` | Pengeluaran tersier mendekati atau melewati batas |
| `allowance_limit` | Jatah anggota hampir habis atau habis |
| `negative_budget` | Sisa fleksibel bulan ini sudah negatif |
| `bill_due` | Pengingat tagihan atau cicilan (opsional) |

`manager` dan `partner` menerima semua peringatan keluarga. `member` hanya menerima peringatan jatahnya sendiri.

## 13.2 Mark Alert as Read

```http
PATCH /api/v1/alerts/:id/read
```

---

# 14. Gold Asset API

Aset emas dicatat sebagai **aset**, terpisah dari saldo yang dapat dibelanjakan. Nilai emas yang naik tidak menambah sisa fleksibel karena emas belum dijual. Hanya `manager` dan `partner` yang dapat mengakses.

## 14.1 Get Gold Assets

### Endpoint

```http
GET /api/v1/assets/gold
```

### Response

```json
{
  "success": true,
  "message": "Gold assets retrieved successfully",
  "data": {
    "items": [
      {
        "id": "gld_001",
        "label": "Emas batangan",
        "weightGram": 6,
        "purity": "24k",
        "buyPricePerGram": 1100000,
        "purchaseDate": "2025-03-01"
      }
    ],
    "summary": {
      "totalWeightGram": 6,
      "currentBuybackPricePerGram": 1350000,
      "estimatedValue": 8100000,
      "totalCost": 6600000,
      "profitLoss": 1500000,
      "priceUpdatedAt": "2026-11-10T08:00:00Z"
    }
  }
}
```

`estimatedValue` dihitung dari harga **buyback** (harga jual kembali), bukan harga beli, agar tidak melebih-lebihkan nilai aset.

## 14.2 Create, Update, Delete Gold Asset

### Endpoint

```http
POST   /api/v1/assets/gold
PATCH  /api/v1/assets/gold/:id
DELETE /api/v1/assets/gold/:id
```

### Request Body (Create)

```json
{
  "label": "Emas batangan",
  "weightGram": 6,
  "purity": "24k",
  "buyPricePerGram": 1100000,
  "purchaseDate": "2025-03-01"
}
```

---

# 15. Gold Price API

Harga emas diambil dari sumber eksternal (misalnya API harga emas internasional yang dikonversi ke Rupiah per gram) dan disimpan sebagai cache agar tidak memanggil sumber eksternal pada setiap request.

## 15.1 Get Current Gold Price

```http
GET /api/v1/gold-prices/current
```

```json
{
  "success": true,
  "message": "Gold price retrieved successfully",
  "data": {
    "pricePerGramBuy": 1450000,
    "pricePerGramBuyback": 1350000,
    "change24hPercent": 0.8,
    "source": "external-api",
    "updatedAt": "2026-11-10T08:00:00Z"
  }
}
```

## 15.2 Get Gold Price History

```http
GET /api/v1/gold-prices/history?range=30d
```

Nilai `range`: `7d`, `30d`, `90d`, `1y`. Jika sumber eksternal gagal, API mengembalikan harga cache terakhir beserta `updatedAt`, atau harga manual yang diinput `manager` sebagai cadangan.

---

# 16. Report API

## 16.1 Monthly Report

Hanya `manager` dan `partner`.

### Endpoint

```http
GET /api/v1/reports/monthly?period=2026-11
```

### Response

```json
{
  "success": true,
  "message": "Monthly report retrieved successfully",
  "data": {
    "period": "2026-11",
    "income": 3000000,
    "totalSpending": 2300000,
    "savings": 700000,
    "byGroup": [
      { "group": "primary", "amount": 1450000 },
      { "group": "secondary", "amount": 200000 },
      { "group": "tertiary", "amount": 650000 }
    ],
    "byCategory": [
      { "categoryId": "cat_001", "name": "Sembako", "group": "primary", "amount": 900000 }
    ],
    "comparisonPreviousMonth": {
      "totalSpendingChangePercent": -5,
      "tertiaryChangePercent": 12
    },
    "recommendations": [
      "Pengeluaran tersier naik 12% dari bulan lalu. Pertimbangkan menurunkan jajan di bulan depan."
    ]
  }
}
```

Field `recommendations` dihasilkan oleh aturan sederhana (rule-based) dari pola pengeluaran, misalnya kategori tersier terbesar yang naik dibanding bulan lalu.

## 16.2 Export Report

```http
GET /api/v1/reports/monthly/export?period=2026-11&format=pdf
```

Opsional. Nilai `format`: `pdf`, `csv`.

---

# 17. Dashboard API

Dashboard memberikan ringkasan untuk layar utama aplikasi mobile. Isinya menyesuaikan role.

### Endpoint

```http
GET /api/v1/dashboard/overview?period=2026-11
```

### Response (manager / partner)

```json
{
  "success": true,
  "message": "Dashboard retrieved successfully",
  "data": {
    "period": "2026-11",
    "flexibleBudget": 1100000,
    "remainingFlexible": 450000,
    "status": "safe",
    "spendingByGroup": { "primary": 1450000, "secondary": 200000, "tertiary": 650000 },
    "recentTransactions": [],
    "unreadAlerts": 1,
    "wealth": {
      "goldEstimatedValue": 8100000
    }
  }
}
```

Untuk role `member`, response hanya berisi jatah pribadi dan transaksi miliknya. Field `wealth`, `flexibleBudget`, dan `spendingByGroup` tidak disertakan.

---

# 18. Validation Error

Apabila request tidak memenuhi validation schema, API mengembalikan `422`.

Contoh request:

```json
{
  "amount": -5000,
  "categoryId": ""
}
```

Response:

```json
{
  "success": false,
  "message": [
    "amount must not be less than 1",
    "categoryId should not be empty",
    "date must be a valid ISO 8601 date string"
  ],
  "error": "Unprocessable Entity",
  "statusCode": 422
}
```

> Format error response dapat berbeda tergantung konfigurasi `ValidationPipe` dan custom exception filter yang digunakan.

---

# 19. DTO Example

```typescript
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTransactionDto {
  @IsInt()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
```

---

# 20. API Endpoint Summary

## Authentication

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

## Family

```http
POST   /api/v1/families
POST   /api/v1/families/join
POST   /api/v1/families/:familyId/invitations
GET    /api/v1/families/:familyId/members
PATCH  /api/v1/families/:familyId/members/:userId
DELETE /api/v1/families/:familyId/members/:userId
PUT    /api/v1/families/:familyId/members/:userId/allowance
```

## Financial Profile

```http
GET    /api/v1/families/:familyId/profile
PUT    /api/v1/families/:familyId/profile
GET    /api/v1/families/:familyId/obligations
POST   /api/v1/families/:familyId/obligations
PATCH  /api/v1/families/:familyId/obligations/:id
DELETE /api/v1/families/:familyId/obligations/:id
```

## Categories

```http
GET    /api/v1/categories
POST   /api/v1/categories
PATCH  /api/v1/categories/:id
DELETE /api/v1/categories/:id
```

## Transactions

```http
GET    /api/v1/transactions
GET    /api/v1/transactions/:id
POST   /api/v1/transactions
PATCH  /api/v1/transactions/:id
DELETE /api/v1/transactions/:id
```

## Receipts

```http
POST /api/v1/receipts
GET  /api/v1/receipts/:id
POST /api/v1/receipts/:id/confirm
```

## Budget, Allowance, Alerts

```http
GET   /api/v1/budgets/current
PATCH /api/v1/budgets/settings
GET   /api/v1/me/allowance
GET   /api/v1/alerts
PATCH /api/v1/alerts/:id/read
```

## Gold

```http
GET    /api/v1/assets/gold
POST   /api/v1/assets/gold
PATCH  /api/v1/assets/gold/:id
DELETE /api/v1/assets/gold/:id
GET    /api/v1/gold-prices/current
GET    /api/v1/gold-prices/history
```

## Reports dan Dashboard

```http
GET /api/v1/reports/monthly
GET /api/v1/reports/monthly/export
GET /api/v1/dashboard/overview
```

---

# 21. Struktur Module NestJS

```text
src/
├── main.ts
├── app.module.ts
│
├── common/
│   ├── decorators/        (@Roles, @CurrentUser)
│   ├── filters/           (HttpExceptionFilter)
│   ├── guards/            (JwtAuthGuard, RolesGuard, FamilyGuard)
│   ├── interceptors/      (ResponseInterceptor)
│   └── dto/               (PaginationDto)
│
├── auth/
├── users/
├── families/              (keluarga, anggota, undangan, role)
├── profiles/              (profil keuangan, obligations)
├── categories/
├── transactions/
├── receipts/              (upload, status, konfirmasi, client OCR)
├── budgets/               (rumus sisa fleksibel, status)
├── allowances/            (jatah anggota)
├── alerts/
├── assets/                (emas)
├── gold-prices/           (client harga eksternal, cache)
├── reports/
└── dashboard/
```

### Peran Tiap Module

| Module | Tanggung jawab |
|---|---|
| `families` | Keluarga, undangan, anggota, dan role |
| `budgets` | Menghitung sisa fleksibel dan status dari profil dan transaksi |
| `receipts` | Menerima foto, memanggil layanan OCR/ML, menyimpan hasil, dan konfirmasi |
| `alerts` | Dipicu setelah transaksi dibuat, memeriksa ambang dan membuat peringatan |
| `gold-prices` | Mengambil dan meng-cache harga emas dari sumber eksternal |

### Guard yang Direkomendasikan

| Guard | Fungsi |
|---|---|
| `JwtAuthGuard` | Memastikan token valid |
| `FamilyGuard` | Memastikan user adalah anggota keluarga yang diakses (mencegah akses data keluarga lain) |
| `RolesGuard` | Memeriksa role (`manager`, `partner`, `member`) untuk endpoint tertentu |

---

# 22. Swagger / OpenAPI

Swagger digunakan untuk dokumentasi API otomatis.

```typescript
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('SmartSpend API')
  .setDescription('API pencatat keuangan keluarga')
  .setVersion('1.0')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('docs', app, document);
```

Dokumentasi dapat diakses di:

```text
http://localhost:3000/docs
```

Contoh penggunaan pada controller:

```typescript
@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  @Post()
  @ApiOperation({ summary: 'Create transaction' })
  @ApiResponse({ status: 201, description: 'Transaction created successfully' })
  create(@Body() dto: CreateTransactionDto) {}
}
```

---

# 23. Rekomendasi Tahapan Pengerjaan

## Phase 1 — Basic CRUD

- Setup project NestJS dan database
- Module categories (seed kategori bawaan)
- Module transactions (CRUD manual)
- Pagination dan filter

## Phase 2 — Authentication

- Register, login, logout, me
- Password hashing dan JWT
- `JwtAuthGuard`

## Phase 3 — Family dan Role

- Create family, undangan, join
- Role `manager` dan `member` (role `partner` menyusul)
- `FamilyGuard` dan `RolesGuard`
- Pembatasan data untuk `member`

## Phase 4 — Financial Profile dan Budget

- Profil keuangan dan obligations
- Perhitungan sisa fleksibel
- Status `safe`, `warning`, `critical`, `exceeded`
- Alert otomatis setelah transaksi dibuat

## Phase 5 — Receipt Scan

- Upload foto struk ke object storage
- Integrasi dengan layanan OCR/ML
- Status `processing`, `needs_review`, `confirmed`, `failed`
- Konfirmasi dan pembuatan transaksi

## Phase 6 — Gold, Report, Dashboard

- Aset emas dan harga emas (dengan cache dan cadangan manual)
- Laporan bulanan dan rekomendasi rule-based
- Dashboard per role

## Phase 7 — Production Ready

- Swagger lengkap
- Unit test dan end-to-end test
- Rate limiting dan logging
- Deploy ke cloud

---

# 24. Final API Architecture

```text
Mobile App
    │
    ▼
NestJS API  (/api/v1)
    │
    ├── JwtAuthGuard / FamilyGuard / RolesGuard
    ├── ValidationPipe
    │
    ├── Controllers
    ├── Services (business logic, budget, alerts)
    │
    ├── PostgreSQL
    ├── Object Storage  (foto struk)
    ├── OCR/ML Service  (preprocessing, OCR, klasifikasi)
    └── Gold Price Provider (API eksternal + cache)
```

Backend NestJS tidak menjalankan OCR sendiri. Foto disimpan ke object storage, lalu layanan OCR/ML memprosesnya dan mengembalikan hasil ke backend.

---

# 25. Learning Objective

Setelah menyelesaikan project ini, tim diharapkan memahami cara membangun REST API menggunakan NestJS dengan konsep:

- Module, Controller, Provider / Service
- DTO dan Entity
- Database dan Relationship
- CRUD
- Validation dan Pipes
- Authentication dan JWT
- Guards, Authorization, Role (RBAC)
- Exception Filter dan Interceptor
- Pagination dan Filtering
- File Upload
- Integrasi dengan layanan eksternal (OCR/ML dan harga emas)
- Swagger / OpenAPI
- Unit Testing dan End-to-End Testing

---

# 26. Validation Schema

Validasi menggunakan `class-validator` dan `class-transformer` melalui `ValidationPipe`.

## 26.1 Register

| Field | Type | Required | Validation |
|---|---|---:|---|
| `name` | string | Yes | Min 3, maks 100 karakter |
| `email` | string | Yes | Format email |
| `password` | string | Yes | Min 8 karakter |
| `passwordConfirmation` | string | Yes | Harus sama dengan `password` |

## 26.2 Create Transaction

| Field | Type | Required | Validation |
|---|---|---:|---|
| `amount` | integer | Yes | Minimal 1 |
| `categoryId` | string | Yes | Tidak boleh kosong, kategori harus ada |
| `date` | string | Yes | ISO 8601, tidak boleh lebih dari akhir hari ini |
| `note` | string | No | Maksimal 200 karakter |

## 26.3 Financial Profile

| Field | Type | Required | Validation |
|---|---|---:|---|
| `period` | string | Yes | Format `YYYY-MM` |
| `monthlyIncome` | integer | Yes | Minimal 0 |
| `householdSize` | integer | Yes | Minimal 1, maksimal 30 |
| `foodCostPerPersonMonthly` | integer | Yes | Minimal 0 |
| `savingsTargetPercent` | integer | No | 0 sampai 100 |

## 26.4 Obligation

| Field | Type | Required | Validation |
|---|---|---:|---|
| `name` | string | Yes | Min 2, maks 100 karakter |
| `amount` | integer | Yes | Minimal 1 |
| `type` | enum | Yes | `installment`, `utility`, `education`, `other` |
| `dueDay` | integer | No | 1 sampai 31 |

## 26.5 Upload Receipt

| Field | Type | Required | Validation |
|---|---|---:|---|
| `image` | file | Yes | JPG atau PNG, maksimal 5 MB |
| `date` | string | No | ISO 8601 |

## 26.6 Confirm Receipt

| Field | Type | Required | Validation |
|---|---|---:|---|
| `date` | string | Yes | ISO 8601 |
| `items` | array | Yes | Minimal 1 item, tiap item divalidasi nested |
| `items[].name` | string | Yes | Min 1, maks 150 karakter |
| `items[].price` | integer | Yes | Minimal 0 |
| `items[].categoryId` | string | Yes | Kategori harus ada |

## 26.7 Gold Asset

| Field | Type | Required | Validation |
|---|---|---:|---|
| `label` | string | Yes | Min 2, maks 100 karakter |
| `weightGram` | number | Yes | Lebih dari 0 |
| `purity` | enum | No | `24k`, `22k`, `18k` |
| `buyPricePerGram` | integer | No | Minimal 1 |
| `purchaseDate` | string | No | ISO 8601, tidak boleh di masa depan |

## 26.8 Allowance

| Field | Type | Required | Validation |
|---|---|---:|---|
| `period` | string | Yes | Format `YYYY-MM` |
| `amount` | integer | Yes | Minimal 0 |

---

# 27. Pagination dan Filter Validation

Endpoint list menggunakan:

```text
?page=1&limit=10
```

| Field | Type | Required | Validation |
|---|---|---:|---|
| `page` | integer | No | Minimal 1 |
| `limit` | integer | No | 1–100 |
| `search` | string | No | Maksimal 100 karakter |
| `group` | enum | No | `primary`, `secondary`, `tertiary` |
| `startDate` | date | No | ISO 8601 |
| `endDate` | date | No | ISO 8601 |

Business rule:

```text
endDate >= startDate
```

---

# 28. Recommended Global Validation Configuration

```typescript
import { ValidationPipe } from '@nestjs/common';

app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }),
);
```

- `whitelist` menghapus property yang tidak ada di DTO.
- `forbidNonWhitelisted` menolak request yang berisi property tidak dikenal.
- `transform` mengubah tipe data, misalnya query `page` dari string menjadi number.

---

# 29. Validation vs Business Validation

## Input Validation

Memastikan bentuk data benar, dan dilakukan dengan `class-validator`, DTO, dan `ValidationPipe`.

```text
email harus berupa email
amount harus integer dan minimal 1
period harus berformat YYYY-MM
weightGram harus lebih dari 0
```

## Business Validation

Memastikan data memenuhi aturan bisnis SmartSpend, dan dilakukan di Service.

```text
User hanya boleh mengakses data keluarganya sendiri
Member tidak boleh mengakses penghasilan, aset, dan laporan keluarga
Kode undangan harus masih berlaku dan belum dipakai
User tidak boleh bergabung ke dua keluarga sekaligus
Manager tidak boleh menghapus dirinya jika masih ada anggota lain
Struk hanya dapat dikonfirmasi jika berstatus needs_review
Transaksi dari struk tidak boleh dibuat dua kali untuk struk yang sama
Kategori bawaan sistem tidak boleh dihapus
Sisa fleksibel dihitung ulang setiap transaksi dibuat, diubah, atau dihapus
```

---

# 30. Request Flow pada NestJS

```text
Client (Mobile)
  │
  ▼
HTTP Request
  │
  ▼
JwtAuthGuard ── tidak valid ──► 401
  │
  ▼
RolesGuard / FamilyGuard ── tidak berhak ──► 403
  │
  ▼
ValidationPipe ── tidak valid ──► 422
  │
  ▼
Controller
  │
  ▼
Service (Business Validation)
  │      └── melanggar aturan ──► 400 / 404 / 409
  ▼
Database
  │
  ▼
Alert Check (setelah transaksi)
  │
  ▼
Response
```

---

# 31. Pengujian

### Unit Test (Service)

| Area | Contoh kasus uji |
|---|---|
| Perhitungan budget | Keluarga A menghasilkan sisa fleksibel negatif, Keluarga B positif |
| Status budget | 69% menghasilkan `safe`, 70% menghasilkan `warning`, 90% menghasilkan `critical`, 100% menghasilkan `exceeded` |
| Nilai emas | 6 gram dengan harga buyback 1.350.000 menghasilkan 8.100.000 |
| Alert | Alert hanya dibuat saat melewati ambang, tidak berulang pada transaksi berikutnya di level yang sama |

### Authorization Test

- `member` mengakses `/budgets/current` harus mendapat `403`
- `member` mengakses `/assets/gold` harus mendapat `403`
- User keluarga lain mengakses transaksi keluarga ini harus mendapat `403` atau `404`
- `member` melihat transaksi hanya miliknya sendiri

### End-to-End Test

```text
Register -> Login -> Create Family -> Set Profile -> Create Transaction -> Alert muncul -> Report
```

### Test Validasi (Create Transaction)

```text
1. Request valid
2. amount = 0
3. amount berupa string
4. categoryId kosong
5. categoryId tidak ada
6. date invalid
7. note lebih dari 200 karakter
8. Unknown property
```

---

# 32. Complete Validation Checklist

### Request Validation

- [ ] Required field sudah divalidasi.
- [ ] Uang menggunakan `@IsInt()` dan `@Min()`.
- [ ] Periode bulan sudah divalidasi formatnya (`YYYY-MM`).
- [ ] Email menggunakan `@IsEmail()`.
- [ ] Enum menggunakan `@IsEnum()`.
- [ ] Tanggal menggunakan `@IsDateString()`.
- [ ] Optional field menggunakan `@IsOptional()`.
- [ ] Array item menggunakan `@ValidateNested()` dan `@Type()`.
- [ ] Upload file diperiksa tipe dan ukurannya.

### Business Validation

- [ ] User adalah anggota keluarga yang diakses.
- [ ] Role memiliki permission untuk aksi tersebut.
- [ ] Resource yang direferensikan tersedia.
- [ ] Status struk sesuai sebelum dikonfirmasi.
- [ ] Tidak ada duplikasi (anggota ganda, transaksi struk ganda).
- [ ] Data `member` tidak membocorkan penghasilan, aset, atau data anggota lain.

---

# 33. Pengembangan Lanjutan

Project SmartSpend dapat dikembangkan lebih lanjut dengan:

- Peran `partner` dan privasi pengeluaran pribadi
- Profil anak tanpa login
- Input transaksi lewat kalimat atau suara ("beli beras 60rb")
- Pengingat tagihan dan cicilan
- Target tabungan
- Ekspor laporan PDF
- Dashboard agregat untuk penyuluh atau LSM (data dianonimkan)
- Notifikasi push
- Prediksi pengeluaran bulan depan

---

> **Catatan untuk tim:** bagian yang masih perlu diputuskan adalah rumus biaya makan per anggota (angka tetap atau diisi pengguna), apakah peran `partner` masuk MVP, dan sumber harga emas yang akan dipakai.

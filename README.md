# Travel Expense Generator

> このプロジェクトは、OpenAI Codexを使用して作成しました。

JR九州の乗車券領収書PDFのファイル名を読み取り、電車と設定済みのバスなどを会社指定のExcel交通費精算書へ入力するTypeScript製CLIです。

PDFのダウンロードは行いません。領収書PDFを入力フォルダーへ配置して実行すると、対象月の明細をExcelテンプレートへ書き込みます。ExcelはOOXML内の対象セルだけを変更し、既存の罫線、結合セル、数式、プルダウン、承認欄、経費シートを保持します。

## 動作環境

- Node.js 22
- npm
- PowerShell（このREADMEのコマンド例で使用）

## セットアップ

```powershell
npm install
Copy-Item expense-report.example.jsonc expense-report.jsonc
```

1. `expense-report.jsonc` にテンプレート、個人情報、出力する交通機関を設定します。
2. Excelテンプレートを `template/交通費精算書テンプレート.xlsx` に配置します。
3. JR九州の乗車券領収書PDFを `inputs/` に配置します。

`expense-report.jsonc`、`template/`、`inputs/`、`outputs/` はGit管理対象外です。設定ファイルはJSONC形式のため、`//` と `/* ... */` のコメントを記載できます。設定内の相対パスは、コマンドを実行したプロジェクトルートを基準に解決されます。

## 設定

`expense-report.example.jsonc` を参考に、次の項目を設定します。

| 項目 | 内容 |
| --- | --- |
| `templatePath` | 使用するExcelテンプレートのパス |
| `inputDirectory` | 領収書PDFを配置するフォルダー |
| `outputDirectory` | 生成した精算書を保存するフォルダー |
| `outputFileName.name` | 出力ファイル名へ使用する名前 |
| `outputFileName.documentName` | 出力ファイル名へ使用するドキュメント名 |
| `outputFileName.version` | 出力ファイル名へ使用するバージョン |
| `sheetName` | 明細を書き込むシート名 |
| `department` | 精算書上部へ出力する所属名 |
| `employeeName` | 精算書上部と精算者欄へ出力する氏名 |
| `oneWayLabel` | 片道明細へ出力する値 |
| `roundTripLabel` | 往復明細へ出力する値 |
| `statementDay` | 精算書上部へ出力する日 |
| `transportations` | 出力する交通機関の配列 |

## 交通機関設定

`transportations` 配列の順番で明細を出力します。各交通機関の `enabled` を `false` にすると、その交通機関は出力されず、テンプレート内に残っている同名の既存明細も削除されます。

### 領収書から生成

`source` が `receipt` の交通機関は、JR九州領収書PDFのファイル名から区間と日付を読み取り、同日の往路と復路を1明細へ集約します。

```jsonc
{
  "enabled": true,
  "source": "receipt",
  "name": "電車",
  "purpose": "通勤",
  "receiptStatus": "有",
  "routeFaresYen": {
    "1": 1550,
    "2": 1550
  }
}
```

### 領収書の日付ごとに生成

`source` が `eachReceiptDate` の交通機関は、取り込んだ領収書に存在する日付ごとに固定区間を1明細ずつ生成します。現在のバス設定では、各出勤日に `一枝入口 → 戸畑駅` の往復560円を出力します。

```jsonc
{
  "enabled": true,
  "source": "eachReceiptDate",
  "name": "バス",
  "departure": "一枝入口",
  "arrival": "戸畑駅",
  "purpose": "通勤",
  "tripType": "roundTrip",
  "receiptStatus": "無",
  "amountYen": 560
}
```

バスを出力しない場合は、バス設定の `enabled` を変更します。

```jsonc
"enabled": false
```

モノレールなどを追加する場合は、バス設定と同じ形式の要素を `transportations` 配列へ追加します。

```jsonc
{
  "enabled": true,
  "source": "eachReceiptDate",
  "name": "モノレール",
  "departure": "出発駅",
  "arrival": "到着駅",
  "purpose": "通勤",
  "tripType": "roundTrip",
  "receiptStatus": "無",
  "amountYen": 400
}
```

## 領収書ファイル名

領収書PDFは、次の形式のファイル名にしてください。

```text
YYYYMMDD_経路番号氏名_費目 領収書_JR出発⇒到着.pdf
```

例:

```text
20260511_1山田 太郎_通勤費 領収書_JR戸畑⇒博多.pdf
20260511_2山田 太郎_通勤費 領収書_JR博多⇒戸畑.pdf
```

- 日付、経路番号、氏名、出発駅、到着駅をファイル名から読み取ります。
- 区間の区切りには `⇒`、`→`、`->` を使用できます。
- 出発駅と到着駅の空白、および末尾の「駅」は自動的に除去されます。
- 電車運賃は `source: "receipt"` の `routeFaresYen` に設定した経路番号から取得します。
- 未設定または0円以下の経路番号が含まれる場合は、処理を中止します。

## 実行

対象月を指定して生成します。

```powershell
npm run generate -- --month 2026-05
```

`inputs/` 内のPDFから、ファイル名の日付が指定年月に一致する明細だけを出力します。既定の出力先は次のとおりです。出力フォルダーが存在しない場合は自動的に作成されます。

```text
outputs/林 勇希_202605 経費交通費精算書ver.4.xlsx
```

既定のファイル名は、`outputFileName` の設定値と対象月から `名前_YYYYMM ドキュメント名バージョン.xlsx` の形式で生成します。

入力フォルダー内の領収書がすべて同じ月の場合は、`--month` を省略できます。

```powershell
npm run generate
```

複数月の領収書が混在している場合は、`--month YYYY-MM` の指定が必要です。

### オプション

| オプション | 内容 | 既定値 |
| --- | --- | --- |
| `--config` | 設定ファイルのパス | `expense-report.jsonc` |
| `--input` | 入力フォルダーを一時的に上書き | 設定の `inputDirectory` |
| `--template` | Excelテンプレートを一時的に上書き | 設定の `templatePath` |
| `--output` | 出力ファイルのパスを指定 | `outputDirectory/名前_YYYYMM ドキュメント名バージョン.xlsx` |
| `--month` | 出力対象月を `YYYY-MM` 形式で指定 | 入力PDFの日付から自動判定 |

実行例:

```powershell
npm run generate -- --config "C:\path\to\expense-report.jsonc" --input "C:\path\to\receipts" --template "C:\path\to\template.xlsx" --output "C:\path\to\report.xlsx" --month 2026-05
```

実行後は、出力先、対象PDF件数、生成した明細件数、生成明細合計、精算書小計、保持した既存明細行をコンソールへ表示します。

## Excelへの出力仕様

- `source: "receipt"` は、同日・同一区間の領収書を1明細へ集約します。
- 同一区間の逆方向の領収書がある場合は往復、ない場合は片道として出力します。
- `source: "eachReceiptDate"` は、対象領収書に存在する日付ごとに固定明細を生成します。
- 交通機関は `transportations` 配列順、その中では日付順に出力します。
- 対象シートの `9～29行` を確認し、設定に存在する交通機関の既存明細を置換します。
- `enabled: false` の交通機関も既存明細を削除し、出力は行いません。
- 設定に存在しない交通機関の既存明細は保持します。
- 小計式の対象となる安全な明細範囲 `9～28行` の空き行だけへ出力します。
- 精算書上部の年・月・日・所属・氏名と、精算者欄の氏名を更新します。
- 小計セルの数式を保持したまま、キャッシュ値を更新します。
- 「経費」シートは変更しません。
- 明細がない、入力可能件数を超える、複数月が混在する、またはテンプレート構造が想定と異なる場合は出力を中止します。

## 開発・検証

型チェック:

```powershell
npm run check
```

テスト:

```powershell
npm test
```

GitHub Actionsでは、`main` ブランチへのpushとPull Requestで型チェックとテストを実行します。

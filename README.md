# Travel Expense Generator

> このプロジェクトは、OpenAI Codexを使用して作成しました。

JR九州の乗車券領収書PDFのファイル名を読み取り、会社指定のExcel交通費精算書へ明細を入力するTypeScript製CLIです。

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

1. `expense-report.jsonc` にテンプレート、個人情報、用途、経路番号ごとの片道運賃を設定します。
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
| `sheetName` | 明細を書き込むシート名 |
| `department` | 精算書上部へ出力する所属名 |
| `employeeName` | 精算書上部と精算者欄へ出力する氏名 |
| `transportation` | 明細の交通機関。既存明細を置換する際の識別にも使用 |
| `defaultPurpose` | 各明細へ出力する用途 |
| `receiptStatus` | 各明細へ出力する領収書の有無 |
| `oneWayLabel` | 片道明細へ出力する値 |
| `roundTripLabel` | 往復明細へ出力する値 |
| `statementDay` | 精算書上部へ出力する日 |
| `routeFaresYen` | ファイル名の経路番号ごとの片道運賃（円） |

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
- 運賃は `routeFaresYen` に設定した経路番号から取得します。
- 未設定または0円以下の経路番号が含まれる場合は、処理を中止します。

## 実行

対象月を指定して生成します。

```powershell
npm run generate -- --month 2026-05
```

`inputs/` 内のPDFから、ファイル名の日付が指定年月に一致する明細だけを出力します。既定の出力先は次のとおりです。出力フォルダーが存在しない場合は自動的に作成されます。

```text
outputs/交通費精算書_2026-05.xlsx
```

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
| `--output` | 出力ファイルのパスを指定 | `outputDirectory/交通費精算書_YYYY-MM.xlsx` |
| `--month` | 出力対象月を `YYYY-MM` 形式で指定 | 入力PDFの日付から自動判定 |

実行例:

```powershell
npm run generate -- --config "C:\path\to\expense-report.jsonc" --input "C:\path\to\receipts" --template "C:\path\to\template.xlsx" --output "C:\path\to\report.xlsx" --month 2026-05
```

実行後は、出力先、対象PDF件数、生成した明細件数、JR九州明細合計、精算書小計、保持した既存明細行をコンソールへ表示します。

## Excelへの出力仕様

- 同日、同一用途、同一区間の領収書を1明細へ集約します。
- 同一区間の逆方向の領収書がある場合は往復、ない場合は片道として出力します。
- 明細は日付、出発駅、到着駅の順で並べます。
- 対象シートの `9～29行` を確認し、`transportation` と同じ交通機関の既存明細を置換します。
- バスなど、`transportation` と異なる交通機関の既存明細は保持します。
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

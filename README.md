# Travel Expense Generator

JR九州領収書PDFのファイル名を読み取り、会社指定の交通費精算書テンプレートへ明細を入力するTypeScript CLIです。

ダウンロード処理とは独立しており、PDFが入った任意のフォルダーを `--input` で渡せます。ExcelはOOXML内の対象セルだけを変更し、既存の罫線、結合セル、数式、プルダウン、承認欄、経費シートを保持します。

## セットアップ

```powershell
npm install
Copy-Item expense-report.example.json expense-report.json
```

`expense-report.json`へテンプレート、個人情報、経路番号ごとの片道運賃を設定してください。このファイルはGit管理対象外です。

テンプレートはプロジェクトルートの `template/交通費精算書テンプレート.xlsx`、ダウンロードしたJR九州領収書PDFは `inputs/` に配置します。`template/` と `inputs/` はGit管理対象外です。

## 実行

ルート配下の `template/` と `inputs/` を使用:

```powershell
npm run generate -- --month 2026-05
```

`--month YYYY-MM` は精算書へ出力する対象年月です。`inputs/` 内にある領収書PDFのうち、ファイル名の日付が指定年月に一致するものだけを出力し、精算書上部の年・月にも反映します。

```text
20260511_...pdf → --month 2026-05 の対象
20260601_...pdf → --month 2026-05 の対象外
```

`inputs/` 内の領収書PDFがすべて同じ月の場合は、自動判定されるため `--month` を省略できます。

```powershell
npm run generate
```

複数月の領収書PDFが混在している場合は、`--month YYYY-MM` の指定が必要です。

必要な場合は、入力フォルダーを一時的に変更できます。

```powershell
npm run generate -- --input "C:\path\to\receipts" --month 2026-05
```

テンプレートと出力先もコマンドで変更できます。

```powershell
npm run generate -- --input "C:\path\to\receipts" --template "C:\path\to\template.xlsx" --output "C:\path\to\report.xlsx" --month 2026-05
```

## 現在の仕様

- ファイル名形式: `YYYYMMDD_経路番号氏名_費目 領収書_JR出発⇒到着.pdf`
- 同日・同一区間の往路と復路は、往復1明細へ集約
- 運賃は `expense-report.json` の `routeFaresYen` から取得
- 既存の同一交通機関の行だけを置換し、バスなど他の明細は保持
- 小計式が対象としている安全な明細範囲 `9～28行` のみ使用
- テンプレート構造が想定と異なる場合は出力を中止

export type ReceiptRecord = {
  sourceFileName: string;
  travelDate: string;
  routeNumber: number;
  employeeName: string;
  purpose: string;
  from: string;
  to: string;
  amountYen: number;
};

export type TravelExpenseItem = {
  travelDate: string;
  transportation: string;
  departure: string;
  arrival: string;
  purpose: string;
  tripType: "oneWay" | "roundTrip";
  receiptStatus: string;
  amountYen: number;
  sourceFileNames: string[];
};

export type ExpenseReportConfig = {
  templatePath: string;
  inputDirectory: string;
  outputDirectory: string;
  sheetName: string;
  department: string;
  employeeName: string;
  transportation: string;
  defaultPurpose: string;
  receiptStatus: string;
  oneWayLabel: string;
  roundTripLabel: string;
  statementDay: number;
  routeFaresYen: Record<string, number>;
};

export type ReceiptRecord = {
  sourceFileName: string;
  travelDate: string;
  routeNumber: number;
  employeeName: string;
  from: string;
  to: string;
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

type BaseTransportationConfig = {
  enabled: boolean;
  name: string;
  purpose: string;
  receiptStatus: string;
};

export type ReceiptTransportationConfig = BaseTransportationConfig & {
  source: "receipt";
  routeFaresYen: Record<string, number>;
};

export type EachReceiptDateTransportationConfig = BaseTransportationConfig & {
  source: "eachReceiptDate";
  departure: string;
  arrival: string;
  tripType: TravelExpenseItem["tripType"];
  amountYen: number;
};

export type TransportationConfig =
  | ReceiptTransportationConfig
  | EachReceiptDateTransportationConfig;

export type ExpenseReportConfig = {
  templatePath: string;
  inputDirectory: string;
  outputDirectory: string;
  outputFileName: {
    name: string;
    documentName: string;
    version: string;
  };
  sheetName: string;
  department: string;
  employeeName: string;
  transportations: TransportationConfig[];
  oneWayLabel: string;
  roundTripLabel: string;
  statementDay: number;
};

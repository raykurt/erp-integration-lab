export type Role = 'EMPLOYEE' | 'MANAGER' | 'HR' | 'WAREHOUSE';

export interface Me {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  annualLeaveBalance: number;
}

export interface LeaveRequest {
  id: number;
  employeeId: number;
  employee?: { id: number; fullName: string };
  type: 'ANNUAL' | 'SICK' | 'UNPAID';
  startDate: string;
  endDate: string;
  workingDays: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  note: string | null;
  decisionReason: string | null;
}

export interface StockRow {
  warehouse: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
}

export interface Movement {
  id: number;
  type: 'IN' | 'OUT' | 'TRANSFER';
  quantity: number;
  item: { itemCode: string };
  fromWarehouse: { code: string } | null;
  toWarehouse: { code: string } | null;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED' | 'DEAD';
  syncAttempts: number;
  erpDocEntry: number | null;
  lastSyncError: string | null;
}

export interface Item {
  itemCode: string;
  name: string;
}

export interface Warehouse {
  code: string;
  name: string;
}

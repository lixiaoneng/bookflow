import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const BOOK_STAGES = [
  '版权登记',
  '版式设计',
  '一审',
  '二审',
  '三审',
  '发稿（申请CIP）',
  '封面设计',
  '一校',
  '二校',
  '三校',
  '核红',
  '质检',
  '外审',
  '通读',
  '详情页',
  '下厂（出数码样和蓝纸）',
  '确认蓝纸',
  '下印',
  '确认装前样',
  '入库'
] as const;

export type StageName = typeof BOOK_STAGES[number];

export enum ProjectStatus {
  ONGOING = '进行中',
  COMPLETED = '已完成',
  OVERDUE = '已逾期'
}

export interface Stage {
  name: StageName;
  plannedDate: string;
  status: '进行中' | '已完成';
}

export type Group = '绘本组' | '科普组' | '文学组' | '其他组';

export interface Editor {
  id: string;
  name: string;
  group: Group;
}

export interface Project {
  id: string;
  name: string;
  group: Group;
  editorIds: string[];
  riskIssues: string;
  stages: Stage[];
  createdAt: string;
}

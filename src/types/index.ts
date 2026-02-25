export type UserRole = 'super_admin' | 'admin';
export type StudentStatus = '등록' | '사회복지사-실습예정' | '수료';
export type EducationLevel = '고등학교졸업' | '전문대졸업' | '대학교재학' | '대학교졸업';

export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface EducationCenter {
  id: number;
  name: string;
  created_at: string;
}

export interface Course {
  id: number;
  name: string;
  created_at: string;
}

export interface Student {
  id: string;
  name: string;
  phone: string | null;
  education_level: EducationLevel | null;
  status: StudentStatus;
  course_id: number | null;
  manager_name: string | null;
  cost: number | null;
  class_start: string | null;
  target_completion_date: string | null;
  education_center_name: string | null;
  all_care: boolean;
  notes: string | null;
  registered_at: string;
  created_at: string;
  updated_at: string;
  courses?: Course | null;
}

export interface StudentFormData {
  name: string;
  phone: string;
  education_level: EducationLevel | '';
  status: StudentStatus;
  course_id: number | '';
  manager_name: string;
  cost: string;
  class_start: string;
  target_completion_date: string;
  education_center_name: string;
  all_care: boolean;
  notes: string;
}

export interface MonthlyEnrollment {
  month: string;
  count: number;
}

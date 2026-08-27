// Re-exporta tipos do API para os componentes não precisarem importar de dois lugares
export type {
  Test,
  TestFlag,
  TestFlagLink,
  TestActivity,
  ActivityType,
} from '../../api/tests'

export type WindsorAccount = 'principal' | 'lab'

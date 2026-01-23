/**
 * Main entry point for the doctor command.
 */
import type { DoctorOptions } from '@/bin/doctor/types';
export { parseDoctorFlags } from '@/bin/doctor/flags';
export declare function runDoctor(options?: DoctorOptions): Promise<number>;

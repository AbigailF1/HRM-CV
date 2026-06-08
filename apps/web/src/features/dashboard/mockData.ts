// Mock data shaped to mirror the server-side Prisma models in
// prisma/schema.prisma (Job, Candidate, Application, User). Keeping field
// names aligned so cards can swap to real API responses later without
// reshaping.

export type JobStatus = 'draft' | 'open' | 'closed' | 'archived'
export type JobType = 'full_time' | 'part_time' | 'contract' | 'internship'
export type ApplicationStatus =
	| 'new'
	| 'screening'
	| 'exam'
	| 'interview'
	| 'offer'
	| 'hired'
	| 'rejected'
	| 'withdrawn'

export type MockJob = {
	id: string
	title: string
	slug: string
	type: JobType
	status: JobStatus
	createdAt: string
	openApplications: number
}

export type MockCandidate = {
	id: string
	firstName: string
	lastName: string
	email: string
}

export type MockApplication = {
	id: string
	jobId: string
	candidateId: string
	status: ApplicationStatus
	submittedAt: string
	job: Pick<MockJob, 'id' | 'title'>
	candidate: MockCandidate
}

export const mockUser = {
	id: 'usr_anthony',
	name: 'Anthony',
	email: 'anthony@ultrahr.com',
}

export const mockJobs: MockJob[] = [
	{
		id: 'job_1',
		title: 'Senior Product Designer',
		slug: 'senior-product-designer',
		type: 'full_time',
		status: 'open',
		createdAt: '2026-05-12T09:00:00Z',
		openApplications: 24,
	},
	{
		id: 'job_2',
		title: 'Frontend Engineer',
		slug: 'frontend-engineer',
		type: 'full_time',
		status: 'open',
		createdAt: '2026-05-20T09:00:00Z',
		openApplications: 41,
	},
	{
		id: 'job_3',
		title: 'HR Business Partner',
		slug: 'hr-business-partner',
		type: 'contract',
		status: 'open',
		createdAt: '2026-05-28T09:00:00Z',
		openApplications: 11,
	},
]

export const mockApplications: MockApplication[] = [
	{
		id: 'app_001',
		jobId: 'job_1',
		candidateId: 'cnd_001',
		status: 'interview',
		submittedAt: '2026-06-01T10:24:00Z',
		job: { id: 'job_1', title: 'Senior Product Designer' },
		candidate: {
			id: 'cnd_001',
			firstName: 'Tyra',
			lastName: 'Dhillon',
			email: 'tyra@example.com',
		},
	},
	{
		id: 'app_002',
		jobId: 'job_2',
		candidateId: 'cnd_002',
		status: 'screening',
		submittedAt: '2026-06-02T13:10:00Z',
		job: { id: 'job_2', title: 'Frontend Engineer' },
		candidate: {
			id: 'cnd_002',
			firstName: 'Marcus',
			lastName: 'Lee',
			email: 'marcus@example.com',
		},
	},
	{
		id: 'app_003',
		jobId: 'job_3',
		candidateId: 'cnd_003',
		status: 'new',
		submittedAt: '2026-06-04T16:42:00Z',
		job: { id: 'job_3', title: 'HR Business Partner' },
		candidate: {
			id: 'cnd_003',
			firstName: 'Aiko',
			lastName: 'Tanaka',
			email: 'aiko@example.com',
		},
	},
	{
		id: 'app_004',
		jobId: 'job_1',
		candidateId: 'cnd_004',
		status: 'offer',
		submittedAt: '2026-06-05T08:55:00Z',
		job: { id: 'job_1', title: 'Senior Product Designer' },
		candidate: {
			id: 'cnd_004',
			firstName: 'Daniel',
			lastName: 'Okafor',
			email: 'daniel@example.com',
		},
	},
]

// Attendance / time tracker style mock — mirrors what an attendance entry
// might look like once the attendance module exposes it.
export const mockTimeTracker = {
	userId: mockUser.id,
	currentSessionSeconds: 13462, // 3h 44m 22s
	isRunning: true,
	startedAt: '2026-06-07T08:30:00Z',
}

export const mockStats = {
	jobLevels: 3781,
	jobLevelsChangePct: 5,
	successRatePct: 60,
	hires: 60,
	open: 30,
	interviewing: 10,
}

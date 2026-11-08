import { QueryInterface } from 'sequelize';

type SeedEvent = {
  event_name: string;
  event_date: string;
  client: string;
  budget: number;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  number_of_projects: number;
};

// Fictional clients; event dates relative to a reference date of November 2026.
const sampleEvents: SeedEvent[] = [
  { event_name: 'Riyadh Digital Transformation Forum', event_date: '2026-02-17', client: 'Najd Telecom', budget: 450000, status: 'COMPLETED', number_of_projects: 4 },
  { event_name: 'Jeddah Seafront Brand Activation', event_date: '2026-03-05', client: 'Desert Bloom Cosmetics', budget: 185000, status: 'COMPLETED', number_of_projects: 2 },
  { event_name: 'Ramadan Majlis Corporate Iftar', event_date: '2026-03-12', client: 'Tuwaiq Capital', budget: 120000, status: 'COMPLETED', number_of_projects: 1 },
  { event_name: 'Red Sea Yacht Show Launch', event_date: '2026-08-20', client: 'Red Dune Resorts', budget: 540000, status: 'CANCELLED', number_of_projects: 2 },
  { event_name: 'Saudi National Day Experience', event_date: '2026-09-23', client: 'Harmony Motors KSA', budget: 780000, status: 'COMPLETED', number_of_projects: 6 },
  { event_name: 'AlUla Heritage Gala Evening', event_date: '2026-10-15', client: 'Red Dune Resorts', budget: 920000, status: 'COMPLETED', number_of_projects: 5 },
  { event_name: 'Jeddah Falcon Cup Sports Festival', event_date: '2026-10-30', client: 'Falcon Sports Academy', budget: 380000, status: 'CANCELLED', number_of_projects: 3 },
  { event_name: 'Dammam Healthcare Innovation Summit', event_date: '2026-11-10', client: 'Al Noor Healthcare Group', budget: 560000, status: 'IN_PROGRESS', number_of_projects: 5 },
  { event_name: 'Riyadh Fintech Leaders Roundtable', event_date: '2026-11-18', client: 'Kingdom Fintech Council', budget: 240000, status: 'IN_PROGRESS', number_of_projects: 2 },
  { event_name: 'Riyadh Season Pop-Up Showcase', event_date: '2026-12-04', client: 'Najd Telecom', budget: 670000, status: 'PLANNED', number_of_projects: 4 },
  { event_name: 'Khobar Culinary Week', event_date: '2026-12-12', client: 'Eastern Culinary Guild', budget: 210000, status: 'PLANNED', number_of_projects: 3 },
  { event_name: 'Tuwaiq Capital Investor Conference', event_date: '2027-01-27', client: 'Tuwaiq Capital', budget: 1250000, status: 'PLANNED', number_of_projects: 8 },
  { event_name: 'Founding Day Heritage Exhibition', event_date: '2027-02-22', client: 'Oasis Real Estate Developers', budget: 830000, status: 'PLANNED', number_of_projects: 6 },
  { event_name: 'Vision Gate University Career Fair', event_date: '2027-03-09', client: 'Vision Gate University', budget: 95000, status: 'PLANNED', number_of_projects: 1 },
];

export = {
  async up(queryInterface: QueryInterface): Promise<void> {
    const now = new Date();
    await queryInterface.bulkInsert(
      'events',
      sampleEvents.map((event) => ({ ...event, created_at: now, updated_at: now })),
    );
  },

  async down(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.bulkDelete('events', {});
  },
};

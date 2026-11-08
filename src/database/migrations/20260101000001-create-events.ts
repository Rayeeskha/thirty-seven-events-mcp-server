import { DataTypes, QueryInterface } from 'sequelize';

const TABLE = 'events';

export = {
  async up(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.createTable(TABLE, {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      event_name: { type: DataTypes.STRING(255), allowNull: false },
      event_date: { type: DataTypes.DATEONLY, allowNull: false },
      client: { type: DataTypes.STRING(150), allowNull: false },
      budget: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      status: {
        type: DataTypes.ENUM('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PLANNED',
      },
      number_of_projects: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.addIndex(TABLE, ['event_date'], { name: 'idx_events_event_date' });
    await queryInterface.addIndex(TABLE, ['client'], { name: 'idx_events_client' });
    await queryInterface.addIndex(TABLE, ['status'], { name: 'idx_events_status' });
    await queryInterface.sequelize.query(
      `ALTER TABLE ${TABLE} ADD CONSTRAINT chk_events_budget_non_negative CHECK (budget >= 0)`,
    );
  },

  async down(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.dropTable(TABLE);
  },
};

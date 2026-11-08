import { DataTypes, QueryInterface } from 'sequelize';

const TABLE = 'pending_operations';

export = {
  async up(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.createTable(TABLE, {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
      operation_type: {
        type: DataTypes.ENUM('CREATE_EVENT', 'UPDATE_EVENT_STATUS'),
        allowNull: false,
      },
      payload: { type: DataTypes.JSON, allowNull: false },
      payload_hash: { type: DataTypes.CHAR(64), allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      consumed_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
    });
  },

  async down(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.dropTable(TABLE);
  },
};

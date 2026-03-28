const IST_NOW_SQL = "CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')";
const IST_DATE_SQL = `DATE(${IST_NOW_SQL})`;
const IST_TIME_SQL = `TIME(${IST_NOW_SQL})`;

module.exports = {
  IST_NOW_SQL,
  IST_DATE_SQL,
  IST_TIME_SQL,
};
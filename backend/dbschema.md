# Database Schema

## admin_activity_logs

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| admin_id | int | NO | MUL |  |  |
| admin_role | varchar(20) | NO |  | admin |  |
| action | varchar(100) | NO | MUL |  |  |
| entity_type | varchar(50) | YES | MUL |  |  |
| entity_id | varchar(50) | YES |  |  |  |
| details | json | YES |  |  |  |
| ip_address | varchar(45) | YES |  |  |  |
| created_at | timestamp | NO | MUL | CURRENT_TIMESTAMP | DEFAULT_GENERATED |


## auto_deposit_logs

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| webhook_txn_id | int | YES | MUL |  |  |
| order_id | int | YES | MUL |  |  |
| deposit_id | int | YES |  |  |  |
| user_id | int | YES | MUL |  |  |
| action | varchar(50) | NO |  |  |  |
| details | text | YES |  |  |  |
| created_at | timestamp | NO | MUL | CURRENT_TIMESTAMP | DEFAULT_GENERATED |


## bank_accounts

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | MUL |  |  |
| account_number | varchar(30) | NO | MUL |  |  |
| ifsc | varchar(11) | NO |  |  |  |
| bank_name | varchar(100) | NO |  |  |  |
| account_holder | varchar(100) | NO |  |  |  |
| is_flagged | tinyint(1) | YES |  | 0 |  |
| flag_reason | text | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |


## bet_numbers

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| bet_id | int | NO | MUL |  |  |
| number | varchar(10) | NO |  |  |  |
| amount | decimal(12,2) | NO |  |  |  |


## bets

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | MUL |  |  |
| game_id | int | NO | MUL |  |  |
| game_result_id | int | YES | MUL |  |  |
| type | enum('jodi','haruf_andar','haruf_bahar','crossing') | NO |  |  |  |
| total_amount | decimal(12,2) | NO |  |  |  |
| win_amount | decimal(12,2) | YES |  | 0.00 |  |
| status | enum('pending','win','loss') | YES | MUL | pending |  |
| settled_at | timestamp | YES |  |  |  |
| created_at | timestamp | YES | MUL | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| session_date | date | YES |  |  |  |


## bonuses

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | MUL |  |  |
| type | enum('first_deposit','slab','referral','daily') | NO |  |  |  |
| amount | decimal(12,2) | NO |  |  |  |
| reference_id | varchar(100) | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |


## daily_bonus_claims

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | MUL |  |  |
| claim_date | date | NO |  |  |  |
| amount | decimal(12,2) | NO |  |  |  |
| created_at | timestamp | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |


## deposits

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | MUL |  |  |
| amount | decimal(12,2) | NO |  |  |  |
| utr_number | varchar(50) | NO | UNI |  |  |
| webhook_txn_id | int | YES | MUL |  |  |
| order_id | int | YES | MUL |  |  |
| payer_name | varchar(150) | YES |  |  |  |
| status | enum('completed') | YES | MUL | completed |  |
| created_at | timestamp | YES | MUL | CURRENT_TIMESTAMP | DEFAULT_GENERATED |


## fraud_alerts

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | MUL |  |  |
| alert_type | varchar(50) | NO | MUL |  |  |
| severity | enum('low','medium','high','critical') | NO | MUL | medium |  |
| details | json | NO |  |  |  |
| is_resolved | tinyint(1) | NO | MUL | 0 |  |
| resolved_by | int | YES |  |  |  |
| resolved_at | timestamp | YES |  |  |  |
| created_at | timestamp | NO | MUL | CURRENT_TIMESTAMP | DEFAULT_GENERATED |


## game_bonus_rates

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| game_type | enum('jodi','haruf_andar','haruf_bahar','crossing') | NO | UNI |  |  |
| bonus_multiplier | decimal(10,2) | NO |  | 1.00 |  |
| updated_by | int | YES | MUL |  |  |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |


## game_payout_rates

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| game_type | enum('jodi','haruf_andar','haruf_bahar','crossing') | NO | UNI |  |  |
| multiplier | decimal(10,2) | NO |  |  |  |
| updated_by | int | YES | MUL |  |  |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |


## game_results

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| game_id | int | NO | MUL |  |  |
| result_number | varchar(10) | YES |  |  |  |
| result_date | date | NO | MUL |  |  |
| declared_at | datetime | YES | MUL |  |  |
| is_settled | tinyint(1) | NO |  | 0 |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |


## games

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| name | varchar(100) | NO | UNI |  |  |
| open_time | time | NO |  |  |  |
| close_time | time | NO |  |  |  |
| result_time | time | YES |  |  |  |
| is_overnight | tinyint(1) | NO |  | 0 |  |
| is_active | tinyint(1) | YES |  | 1 |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |


## home_banners

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int unsigned | NO | PRI |  | auto_increment |
| title | varchar(255) | NO |  |  |  |
| content | text | NO |  |  |  |
| extra_text | varchar(500) | NO |  |  |  |
| button_text | varchar(100) | NO |  |  |  |
| button_link | varchar(500) | NO |  |  |  |
| image_url | varchar(500) | NO |  |  |  |
| display_order | int unsigned | NO |  | 0 |  |
| status | tinyint(1) | NO |  | 1 |  |
| created_at | timestamp | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |


## moderator_scanner_audit_logs

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| moderator_id | int | NO | MUL |  |  |
| actor_id | int | YES | MUL |  |  |
| actor_role | varchar(20) | YES |  |  |  |
| field_name | varchar(50) | NO | MUL |  |  |
| old_value | varchar(255) | YES |  |  |  |
| new_value | varchar(255) | YES |  |  |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |


## notifications

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| user_id | int | YES | MUL |  |  |
| type | enum('win','deposit','withdraw','system') | NO |  |  |  |
| message | varchar(500) | NO |  |  |  |
| is_read | tinyint(1) | YES |  | 0 |  |
| created_at | timestamp | YES | MUL | CURRENT_TIMESTAMP | DEFAULT_GENERATED |


## otps

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| phone | varchar(20) | NO | MUL |  |  |
| purpose | enum('register','reset_mpin') | NO |  | register |  |
| otp | varchar(6) | NO |  |  |  |
| expires_at | timestamp | NO | MUL |  |  |
| is_used | tinyint(1) | YES |  | 0 |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |


## pending_deposit_orders

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | MUL |  |  |
| amount | decimal(12,2) | NO |  |  |  |
| order_ref | varchar(12) | YES | UNI |  |  |
| pay_amount | decimal(12,2) | YES | MUL |  |  |
| status | enum('pending','matched','expired','cancelled') | NO | MUL | pending |  |
| matched_deposit_id | int | YES |  |  |  |
| matched_webhook_id | int | YES |  |  |  |
| expires_at | timestamp | NO | MUL |  |  |
| created_at | timestamp | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |


## referrals

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| referrer_id | int | NO | MUL |  |  |
| referred_user_id | int | NO | UNI |  |  |
| bonus_amount | decimal(12,2) | YES |  | 0.00 |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |


## settings

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| setting_key | varchar(100) | NO | UNI |  |  |
| setting_value | text | NO |  |  |  |
| description | varchar(255) | YES |  |  |  |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |


## settlement_queue

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| game_result_id | int | NO | UNI |  |  |
| game_id | int | NO | MUL |  |  |
| result_number | varchar(2) | NO |  |  |  |
| result_date | date | NO |  |  |  |
| status | enum('pending','processing','done','failed') | NO | MUL | pending |  |
| attempts | int | NO |  | 0 |  |
| error_message | text | YES |  |  |  |
| created_at | timestamp | NO |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| started_at | timestamp | YES |  |  |  |
| completed_at | timestamp | YES |  |  |  |


## upi_webhook_transactions

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| raw_message | text | NO |  |  |  |
| amount | decimal(12,2) | YES | MUL |  |  |
| reference_number | varchar(50) | YES | UNI |  |  |
| payer_name | varchar(150) | YES |  |  |  |
| txn_time | varchar(50) | YES |  |  |  |
| status | enum('received','matched','unmatched','duplicate','parse_error') | NO | MUL | received |  |
| matched_order_id | int | YES |  |  |  |
| matched_deposit_id | int | YES |  |  |  |
| match_attempted_at | timestamp | YES |  |  |  |
| error_message | varchar(500) | YES |  |  |  |
| telegram_message_id | varchar(100) | YES | MUL |  |  |
| telegram_chat_id | varchar(100) | YES |  |  |  |
| created_at | timestamp | NO | MUL | CURRENT_TIMESTAMP | DEFAULT_GENERATED |


## users

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| name | varchar(100) | YES |  |  |  |
| phone | varchar(20) | NO | UNI |  |  |
| password | varchar(255) | YES |  |  |  |
| mpin_hash | varchar(255) | YES |  |  |  |
| mpin_enabled | tinyint(1) | YES |  | 0 |  |
| mpin_attempts | int | YES |  | 0 |  |
| mpin_blocked_until | timestamp | YES |  |  |  |
| role | enum('admin','moderator','user') | YES |  | user |  |
| moderator_id | int | YES | MUL |  |  |
| referral_code | varchar(20) | YES | UNI |  |  |
| upi_id | varchar(150) | YES |  |  |  |
| scanner_label | varchar(100) | YES |  |  |  |
| scanner_enabled | tinyint(1) | YES |  | 1 |  |
| default_bank_account_id | int | YES | MUL |  |  |
| is_blocked | tinyint(1) | YES |  | 0 |  |
| failed_login_attempts | int | NO |  | 0 |  |
| login_blocked_until | datetime | YES |  |  |  |
| is_deleted | tinyint(1) | NO | MUL | 0 |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |


## wallet_transactions

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | MUL |  |  |
| type | enum('deposit','bet','win','withdraw','adjustment','bonus','refund') | YES | MUL |  |  |
| amount | decimal(12,2) | NO |  |  |  |
| balance_after | decimal(12,2) | NO |  |  |  |
| status | enum('pending','completed','failed') | YES |  | completed |  |
| reference_type | varchar(50) | YES | MUL |  |  |
| reference_id | varchar(100) | YES |  |  |  |
| remark | varchar(255) | YES |  |  |  |
| created_at | timestamp | YES | MUL | CURRENT_TIMESTAMP | DEFAULT_GENERATED |


## wallets

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | UNI |  |  |
| balance | decimal(12,2) | YES |  | 0.00 |  |
| bonus_balance | decimal(12,2) | YES |  | 0.00 |  |
| created_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |


## withdraw_requests

| Column | Type | Nullable | Key | Default | Extra |
|-------|------|----------|-----|---------|-------|
| id | int | NO | PRI |  | auto_increment |
| user_id | int | NO | MUL |  |  |
| bank_id | int | NO | MUL |  |  |
| amount | decimal(12,2) | NO |  |  |  |
| status | enum('pending','approved','rejected') | YES | MUL | pending |  |
| approved_by | int | YES | MUL |  |  |
| reject_reason | varchar(255) | YES |  |  |  |
| created_at | timestamp | YES | MUL | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES |  | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |



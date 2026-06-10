---
tags: [handoff, tools]
---
# 🛠️ H06 — Outils (≈150)
[[00 HANDOFF HUB|← Hub]]

Définitions : `backend/src/integrations/tools.ts`. Exécution : `tool-executor.ts`. Affectés aux [[H04 Cerveau Agents & gardes|agents]] dans `agent-registry.ts`.

## Réservations & parc
`list_bookings`, `create_booking`, `update_booking`, `cancel/delete_booking`, `check_car_availability`, `get_fleet_status`, `add_car`, `update_car`, `get_car_photo`, `get/update_vehicle_maintenance`, `save_vehicle_state_before/after`

## Finance & paiements → [[H08 Finance & règles métier]]
`get_financial_report`, `get_revenue_report`, `get_finance_dashboard`, `get_payment_status`, `record_payment`, `get_unpaid_bookings`, `get_late_returns`, `generate_receipt`, `export_accounting`, `export_excel`, `check_anomalies`, `apply_dynamic_pricing`

## Clients & documents
`get_client_profile/history/brain`, `add_client_note`, `rate_client`, `record_feedback`, `store_document`, `get_client_document`, `generate_contract`, `generate_reservation_voucher`, `create_signature_link`

## Image & vidéo → [[H07 Images]]
`generate_image` (gpt-image-1), `transform_image`, `estimate_damage`, `analyze_image`, `enhance_image`, `remove_background`, `add_text_overlay`, `create_social_variants`, `search_images`, `generate_ai_video`, `create_marketing_video`, `merge_videos`, `publish_to_socials`

## Immo & vente
`list_properties`, `create_property`, `get_property_photo`, `update_property_status`, `list_vehicles_for_sale`, `add_vehicle_for_sale`, `mark_vehicle_sold`, `list/create_pack`

## Web, maps, infos
`web_search`, `fetch_url`, `get_travel_time`, `get_my_location`, `get_weather`, `get_news`, `analyze_competitors`, `run_tiktok_research`

## Mémoire & système
`remember_info`, `recall_memory`, `learn_rule`, `track_habit`, `schedule_reminder`, `github_read/write_file`, `railway_get_logs`, `netlify_deploy`, `supabase_execute`, `nexus_*` (PC), `send_whatsapp_to_client`, `send_telegram_message`

Suite : [[H07 Images]]

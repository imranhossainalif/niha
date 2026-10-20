# Data model (exported from the current artifact DB on 2026-10-20)

Each collection is a folder in `data/`; each file is one document (`<id>.json`). Field types below are inferred from the data.


## books (2 docs)
`author`:str, `business`:str, `category`:str, `created_at`:str, `format`:str, `priority`:str, `status`:str, `target_date`:str, `title`:str, `updated_at`:str, `start_date`:str

## calls_daily (94 docs)
`asof`:str, `calls`:int, `date`:str, `ord`:dict, `orders`:int, `rcv`:dict, `received`:int, `reps`:dict, `src`:dict, `order_tk`:int, `otk`:dict

## comp_watch (6 docs)
`active`:str, `business`:str, `category`:str, `created_at`:str, `name`:str, `page`:str

## comp_weekly (1 docs)
`adlib`:str, `ads`:list, `ads_checked`:str, `created_at`:str, `from`:str, `label`:str, `pages`:list, `summary`:str, `to`:str, `week`:str

## dues (1 docs)
`amount`:int, `business`:str, `created_at`:str, `direction`:str, `due_date`:str, `party`:str, `status`:str, `updated_at`:str

## fixed_costs (24 docs)
`active`:str, `amount`:int, `business`:str, `category`:str, `created_at`:str, `end_month`:str, `name`:str, `note`:str, `start_month`:str, `updated_at`:str

## funnel_steps (30 docs)
`audience`:str, `business`:str, `created_at`:str, `how`:str, `offer`:str, `order`:int, `price`:str, `stage`:str, `status`:str, `updated_at`:str

## goals (20 docs)
`business`:str, `created_at`:str, `current`:int, `due`:str, `horizon`:str, `metric`:str, `note`:str, `start_value`:int, `status`:str, `target`:int, `title`:str, `unit`:str, `updated_at`:str

## ib_products (1 docs)
`active`:str, `age`:str, `business`:str, `created_at`:str, `name`:str, `price`:str

## ideas (40 docs)
`business`:str, `competitor`:str, `created_at`:str, `link`:str, `note`:str, `source`:str, `stage`:str, `title`:str, `type`:str, `updated_at`:str, `week`:str

## kb_chunks (33 docs)
`chunks`:list, `doc`:str, `src`:str, `title`:str

## kb_docs (33 docs)
`chunks`:int, `course`:str, `created_at`:str, `file`:str, `frameworks`:str, `order`:int, `pages`:int, `title`:str, `topics`:list, `trainer`:str, `updated_at`:str

## kc_packing (24 docs)
`asof`:str, `daily`:dict, `days`:int, `est_cost`:int, `est_value`:int, `kg`:dict, `month`:str, `ret_daily`:dict, `ret_days`:int, `ret_kg`:dict, `ret_total`:int, `ret_value`:int, `source`:str, `total_kg`:float, `unpriced`:list

## learning (5 docs)
`business`:str, `created_at`:str, `kind`:str, `link`:str, `priority`:str, `source`:str, `status`:str, `target_date`:str, `title`:str, `topic`:str, `updated_at`:str, `start_date`:str, `total`:int

## loans (31 docs)
`business`:str, `created_at`:str, `last_date`:str, `lender`:str, `list_no`:int, `next_due`:str, `note`:str, `outstanding`:int, `principal`:int, `status`:str, `updated_at`:str

## pc_items (22 docs)
`aliases`:list, `archived`:bool, `bn`:str, `business`:str, `created_at`:str, `history`:list, `name`:str, `order`:int, `unit`:str, `updated_at`:str

## pl_kidscare (23 docs)
`ads_rate`:int, `ads_usd_manual`:int, `asof`:str, `cost`:int, `estimate`:bool, `month`:str, `note`:str, `orders`:int, `other_costs`:list, `sales`:int, `sm_ads_usd`:float, `source`:str, `wb`:dict, `ads_daily`:dict, `ads_days`:int, `ads_usd`:float, `free_lines`:int, `last_date`:str, `lines`:int, `products`:list, `other_costs_wb`:list, `other_note`:str, `items`:list

## playbooks (5 docs)
`business`:str, `sections`:list, `title`:str, `updated`:str

## product_costing (1 docs)
`asof`:str, `items`:list, `source`:str

## sales_daily (93 docs)
`asof`:str, `business`:str, `cancelled`:int, `cash_due`:int, `date`:str, `delivered`:int, `delivered_amount`:int, `in_progress`:int, `orders`:int, `real_orders`:int, `sent`:int, `sent_amount`:int, `sent_delivered`:int, `sent_delivered_amount`:int, `sent_in_transit`:int, `sent_in_transit_amount`:int, `sent_other`:int, `sent_returned`:int, `source`:str

## sales_team (4 docs)
`asof`:str, `month`:str, `people`:list, `checks`:list, `current_cycle`:str, `cycles`:list, `dues`:list, `dues_new`:list, `leaderboard`:list, `leaderboard_new`:list, `merged_note`:str, `month_detail`:list, `month_detail_label`:str, `months`:list, `months_new`:list, `old_alltime`:dict, `payments`:list, `periods`:list, `courier`:list, `datacheck`:list, `last7`:list, `last7_v7`:list, `month_v7`:list, `months_hist`:list, `pipeline`:list, `segments`:list, `selected_day`:list, `selected_label`:str, `today`:list, `today_label`:str, `trend14`:list, `v6`:dict, `days`:list

## settings (4 docs)
`note`:str, `updated_at`:str, `usd_rate`:int, `channel`:str, `connected`:bool, `in_scenario`:int, `send_scenario`:int, `store`:int, `business`:str, `checks`:dict, `vals`:dict, `aov_target`:int, `asof`:str, `funnel_note`:str, `month`:str, `offers`:list, `orders_day_team`:int, `plan`:str, `rep_calls_day`:int, `rep_orders_day`:int, `reps`:list, `rules`:list, `sales_target`:int, `subtitle`:str

## snapshots (1 docs)
`as_of`:str, `cancel`:list, `districts`:list, `products`:list, `source`:str, `sources`:list

## spend_import (16 docs)
`asof`:str, `items`:list, `month`:str, `source`:str, `total`:int

## tasks (320 docs)
`business`:str, `created_at`:str, `date`:str, `done`:bool, `note`:str, `owner`:str, `plan`:str, `priority`:str, `status`:str, `tags`:list, `title`:str, `updated_at`:str, `milestone`:bool, `week`:int, `week_start`:str, `goal_id`:str, `rep`:bool, `source`:str, `done_at`:str

## team (1 docs)
`business`:str, `created_at`:str, `name`:str, `role`:str, `salary`:int, `updated_at`:str
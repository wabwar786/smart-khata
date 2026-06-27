# Demo Seed Row Fix

Railway logs showed:

```text
Demo seed failed.
query returned more than one row
```

Cause: the previous mobile shop seed used a multi-row `INSERT ... RETURNING financial_account_id INTO v_temp` for four financial accounts. PostgreSQL cannot put multiple returned rows into one scalar variable inside PL/pgSQL, so the seed transaction rolled back and no demo records appeared.

Fix added:

- Removed the multi-row `RETURNING ... INTO` from financial account insert.
- Selected each financial account ID after insertion with `ORDER BY ... LIMIT 1`.
- Improved seed error logging with PostgreSQL code/detail/where info.

After redeploy, `/startup-status` should show `completed` and the database should contain:

- Business: `Smart Mobile Center Demo`
- Currency: `PKR`
- Login: `demo.owner@smartkhata.pk / Demo@12345`

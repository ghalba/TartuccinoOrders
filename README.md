# Coffee Order Log

A small web app for a coffee shop counter.

- **Employees** sign in on any phone, tablet or computer. They log orders, mark them paid, and see today's orders.
- **The owner** signs in and sees everything employees see, plus:
  - the money collected and still unpaid
  - the end-of-day total and items sold
  - who logged each order
  - any past day
  - a menu and price editor
  - the option to delete orders

The page is hosted for free on **GitHub Pages**. The orders are stored in a free **Supabase** database that you own.

---

## 1. Create the database (Supabase, about 10 minutes)

1. Go to <https://supabase.com>, sign up, and click **New project**. Choose any name and a strong database password, and pick the region closest to the shop.
2. When the project is ready, open **SQL Editor** → **New query**. Paste the whole content of `supabase-setup.sql` into it and press **Run**. It should say "Success".
3. Stop strangers from creating accounts: go to **Authentication** → **Sign In / Providers** (called **Providers** in some versions) and turn **off** "Allow new users to sign up". Leave **Email** enabled.
4. Create the logins: go to **Authentication** → **Users** → **Add user** → **Create new user**.
   - Create one for the owner and one for each employee, with an email and a password.
   - Tick **Auto Confirm User**.
   - Every new user starts as an **employee**.
5. Make the owner an owner: go back to **SQL Editor** and run this, using the owner's email:
   ```sql
   update public.profiles set role = 'owner'
   where id = (select id from auth.users where email = 'owner@example.com');
   ```
6. Optional: to show nicer names than the start of the email, open **Table Editor** → `profiles` and edit the `name` column.
7. Get the connection details: open **Project Settings** → **API** (or the **Connect** button at the top). Copy:
   - the **Project URL**
   - the **anon public** key

## 2. Connect the app

Open `config.js` and paste the two values:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://xxxxxxxx.supabase.co",
  supabaseAnonKey: "eyJhbGciOi...",
  shopName: "Coffee Order Log"   // change to your shop's name
};
```

The anon key is meant to be public, so it's fine for it to be on GitHub. Each person only gets the access their login allows. Never put the **service_role** key here.

## 3. Put it online (GitHub Pages)

1. On <https://github.com>, click **New repository**. Name it, for example, `coffee-order-log`, and make it **Public**. Free GitHub Pages needs a public repository. Only the page code is public, not your orders.
2. In the new repository, click **uploading an existing file**. Drag in these files and click **Commit changes**:
   - `index.html`
   - `app.js`
   - `config.js`
   - `supabase-setup.sql`
   - `README.md`
3. Go to **Settings** → **Pages**. Under "Build and deployment", choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and click **Save**.
4. After a minute the address appears at the top of that page, for example `https://your-username.github.io/coffee-order-log/`. Open it on the counter device, sign in, and add the menu from the owner account.

Tip: on a phone, use **Add to Home Screen** so the log opens like an app.

---

## Who can do what

|                                    | Employee | Owner |
|------------------------------------|:--------:|:-----:|
| Log orders, mark paid / unpaid     | ✓ (orders from the last 36 hours) | ✓ |
| See today's orders                 | ✓ | ✓ |
| Daily totals, end of day, past days| – | ✓ |
| Who logged each order              | – | ✓ |
| Edit menu, prices, currency        | – | ✓ |
| Delete orders                      | – | ✓ |

These rules are enforced by the database, not just hidden in the page. An employee can't read old days or change prices even with technical tricks.

## Everyday use

- **New order:** tap menu items, adjust quantities with − and +, add the customer's name or table if you like, tick **Paid now** if they paid, and press **Log order**.
- **Paying later:** find the amber **UNPAID** order and press **Mark paid**.
- **Closing the day (owner):** the **End of day** section shows:
  - the cash from paid orders
  - what is still unpaid
  - the day total
  - items sold
  - orders per employee

## Managing staff

- **New employee:** Supabase → Authentication → Users → **Add user**.
- **Employee leaves:** delete their user there. Their past orders stay and show as "former staff".
- **Forgotten password:** in the user list, open the user's menu and set a new password, or send a password recovery email.

Supabase's free plan pauses a project after a week with no activity. A shop that logs orders every day won't hit this. If it ever happens, open the Supabase dashboard and click **Restore**.

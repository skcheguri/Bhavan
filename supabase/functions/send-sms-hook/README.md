# MSG91 Send SMS Hook -- setup

This wires MSG91 into Supabase's phone-OTP flow as the SMS delivery
provider. Supabase still generates and verifies the OTP; this function
only delivers the text message via MSG91.

## 1. Get your MSG91 values

In the MSG91 dashboard:
- **Auth Key** -- Settings -> API
- **Sender ID** -- the 6-character DLT-approved sender ID for your account
- **Template ID** -- the DLT-approved OTP template (MSG91's OTP product
  usually creates one for you during onboarding). Open the template's
  detail page and note the **variable name** it uses for the OTP number
  (commonly `OTP` or `var1`) -- this must match `MSG91_OTP_VAR_NAME` below.

## 2. Log in and link this project

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

`<your-project-ref>` is the id in your Supabase project URL:
`https://<project-ref>.supabase.co`.

## 3. Deploy the function

```bash
npx supabase functions deploy send-sms-hook --no-verify-jwt
```

`--no-verify-jwt` is required -- Supabase itself calls this hook (not a
logged-in user), so it won't carry a normal user JWT. The hook is
authenticated separately via the signing secret in step 4.

## 4. Enable the hook in the Supabase dashboard

Dashboard -> **Authentication** -> **Hooks** -> **Send SMS hook** ->
enable it -> choose **Supabase Edge Functions** -> select `send-sms-hook`.

Supabase will generate a signing secret that looks like
`v1,whsec_xxxxxxxxxxxx`. Copy it -- you need it in the next step.

## 5. Set secrets

```bash
npx supabase secrets set \
  MSG91_AUTH_KEY=your-msg91-auth-key \
  MSG91_SENDER_ID=your-sender-id \
  MSG91_TEMPLATE_ID=your-template-id \
  MSG91_OTP_VAR_NAME=OTP \
  SEND_SMS_HOOK_SECRET="v1,whsec_xxxxxxxxxxxx"
```

Replace `MSG91_OTP_VAR_NAME=OTP` with whatever variable name your
template actually uses if it isn't `OTP`.

## 6. Test it

Use the Mobile OTP tab on `/signup` or `/login` with a real phone
number. If something's wrong, check the function logs in the Supabase
dashboard under **Edge Functions -> send-sms-hook -> Logs** (this CLI has
no `functions logs` subcommand).

Common issues:
- **"MSG91 could not send the OTP SMS"** -- template ID, sender ID, or
  variable name doesn't match what's registered in MSG91.
- **Signature verification failure** -- `SEND_SMS_HOOK_SECRET` doesn't
  match the value shown in the dashboard's Hooks page (re-copy it; it
  rotates if you disable/re-enable the hook).
- **Nothing happens / generic Supabase error** -- confirm step 4 is
  actually pointed at `send-sms-hook` and not left disabled.

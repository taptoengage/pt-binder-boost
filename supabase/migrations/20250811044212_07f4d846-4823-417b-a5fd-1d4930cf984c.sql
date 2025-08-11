-- Fix remaining function search path issues

-- Fix link_subscription_payment_to_billing_period function
CREATE OR REPLACE FUNCTION public.link_subscription_payment_to_billing_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  period_id uuid;
BEGIN
  -- Only proceed if this is a subscription payment
  IF NEW.client_subscription_id IS NOT NULL AND NEW.session_pack_id IS NULL THEN
    -- Find the earliest due billing period (REMOVED date restriction)
    SELECT id INTO period_id
    FROM subscription_billing_periods
    WHERE client_subscription_id = NEW.client_subscription_id
      AND status = 'due'
    ORDER BY period_start_date ASC
    LIMIT 1;
    
    -- Update the billing period if found
    IF period_id IS NOT NULL THEN
      UPDATE subscription_billing_periods
      SET status = 'paid',
          payment_id = NEW.id,
          updated_at = now()
      WHERE id = period_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix generate_initial_billing_periods function
CREATE OR REPLACE FUNCTION public.generate_initial_billing_periods()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  first_full_period_start_date date;
  partial_period_end_date date;
  full_period_end_date date;
  days_to_add integer;
BEGIN
  -- Only proceed if status is 'active' (for both INSERT and UPDATE)
  IF NEW.status = 'active' THEN
    -- For UPDATE, only proceed if status changed to 'active'
    IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
      RETURN NEW;
    END IF;

    -- Calculate first full period start date (the Monday on or after NEW.start_date)
    -- EXTRACT(DOW FROM date) returns 0 for Sunday, 1 for Monday, ..., 6 for Saturday.
    -- (8 - DOW) % 7 gives:
    -- If DOW is 1 (Monday), (8-1)%7 = 7%7 = 0 (add 0 days)
    -- If DOW is 2 (Tuesday), (8-2)%7 = 6%7 = 6 (add 6 days to get next Monday)
    -- If DOW is 0 (Sunday), (8-0)%7 = 8%7 = 1 (add 1 day to get next Monday)
    first_full_period_start_date := NEW.start_date + (8 - EXTRACT(DOW FROM NEW.start_date))::integer % 7;
   
    -- Generate partial period if subscription doesn't start on Monday
    IF NEW.start_date < first_full_period_start_date THEN
      partial_period_end_date := first_full_period_start_date - 1;
      
      INSERT INTO subscription_billing_periods (
        client_subscription_id,
        period_start_date,
        period_end_date,
        amount_due,
        status
      ) VALUES (
        NEW.id,
        NEW.start_date,
        partial_period_end_date,
        NEW.billing_amount,
        'due'
      );
      
      -- Debug log for partial period
      RAISE NOTICE 'DEBUG: Generated initial partial period: subscriptionId=%, startDate=%, endDate=%, amountDue=%', 
        NEW.id, NEW.start_date, partial_period_end_date, NEW.billing_amount;
    END IF;

    -- Calculate days to add for full period based on payment frequency
    CASE NEW.payment_frequency
      WHEN 'weekly' THEN days_to_add := 6;
      WHEN 'fortnightly' THEN days_to_add := 13;
      WHEN 'monthly' THEN days_to_add := 27;
      ELSE days_to_add := 6; -- Default to weekly
    END CASE;

    -- Calculate full period end date
    full_period_end_date := first_full_period_start_date + days_to_add;

    -- Generate first full billing period
    INSERT INTO subscription_billing_periods (
      client_subscription_id,
      period_start_date,
      period_end_date,
      amount_due,
      status
    ) VALUES (
      NEW.id,
      first_full_period_start_date,
      full_period_end_date,
      NEW.billing_amount,
      'due'
    );
    
    -- Debug log for full period
    RAISE NOTICE 'DEBUG: Generated first full period: subscriptionId=%, startDate=%, endDate=%, amountDue=%', 
      NEW.id, first_full_period_start_date, full_period_end_date, NEW.billing_amount;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and continue
    RAISE WARNING 'Error generating billing periods for subscription %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;
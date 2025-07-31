-- Fix security warning: Set search_path for the function
CREATE OR REPLACE FUNCTION public.link_subscription_payment_to_billing_period()
RETURNS TRIGGER 
SET search_path = public
AS $$
DECLARE
  earliest_due_period subscription_billing_periods%ROWTYPE;
BEGIN
  -- Only proceed if this is a subscription payment (has client_subscription_id and no session_pack_id)
  IF NEW.client_subscription_id IS NOT NULL AND NEW.session_pack_id IS NULL THEN
    
    -- Find the earliest outstanding billing period for this subscription
    SELECT * INTO earliest_due_period
    FROM subscription_billing_periods
    WHERE client_subscription_id = NEW.client_subscription_id
      AND status = 'due'
      AND period_start_date <= NEW.created_at::date
    ORDER BY period_start_date ASC
    LIMIT 1;
    
    -- If we found a matching billing period, update it
    IF earliest_due_period.id IS NOT NULL THEN
      UPDATE subscription_billing_periods
      SET status = 'paid',
          payment_id = NEW.id,
          updated_at = now()
      WHERE id = earliest_due_period.id;
      
      -- Debug logging
      RAISE NOTICE 'DEBUG: Payment linked to billing period: paymentId=%, subscriptionId=%, billingPeriodId=%', 
        NEW.id, NEW.client_subscription_id, earliest_due_period.id;
    ELSE
      -- Log when no matching due period is found
      RAISE NOTICE 'INFO: No matching due billing period found for subscription payment: paymentId=%, subscriptionId=%', 
        NEW.id, NEW.client_subscription_id;
    END IF;
    
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and continue without failing the payment insert
    RAISE WARNING 'Error linking payment to billing period for payment %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
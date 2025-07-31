import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Subscription {
  id: string
  status: string
  payment_frequency: string
  billing_amount: number
  end_date: string | null
}

interface BillingPeriod {
  id: string
  client_subscription_id: string
  period_start_date: string
  period_end_date: string
  amount_due: number
  status: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('Starting recurring billing periods generation...')

    // Fetch all active subscriptions
    const { data: activeSubscriptions, error: subscriptionsError } = await supabase
      .from('client_subscriptions')
      .select('id, status, payment_frequency, billing_amount, end_date')
      .eq('status', 'active')

    if (subscriptionsError) {
      console.error('Error fetching active subscriptions:', subscriptionsError)
      throw subscriptionsError
    }

    console.log(`Found ${activeSubscriptions?.length || 0} active subscriptions`)

    let periodsCreated = 0
    let subscriptionsProcessed = 0

    // Process each active subscription
    for (const subscription of activeSubscriptions || []) {
      try {
        subscriptionsProcessed++
        console.log(`Processing subscription ${subscription.id}`)

        // Find the latest billing period for this subscription
        const { data: latestPeriods, error: periodsError } = await supabase
          .from('subscription_billing_periods')
          .select('period_end_date')
          .eq('client_subscription_id', subscription.id)
          .order('period_end_date', { ascending: false })
          .limit(1)

        if (periodsError) {
          console.error(`Error fetching periods for subscription ${subscription.id}:`, periodsError)
          continue
        }

        // Skip if no periods exist (should be handled by initial generation)
        if (!latestPeriods || latestPeriods.length === 0) {
          console.log(`No existing periods found for subscription ${subscription.id}, skipping`)
          continue
        }

        const latestPeriodEndDate = new Date(latestPeriods[0].period_end_date)
        const nextPeriodStartDate = new Date(latestPeriodEndDate)
        nextPeriodStartDate.setDate(nextPeriodStartDate.getDate() + 1)

        // Check if new period is needed (within 60 days threshold)
        const currentDate = new Date()
        const thresholdDate = new Date(currentDate)
        thresholdDate.setDate(currentDate.getDate() + 60)

        if (nextPeriodStartDate > thresholdDate) {
          console.log(`Next period start date ${nextPeriodStartDate.toISOString().split('T')[0]} is beyond threshold for subscription ${subscription.id}`)
          continue
        }

        // Calculate period end date based on payment frequency
        let daysToAdd: number
        switch (subscription.payment_frequency) {
          case 'weekly':
            daysToAdd = 6
            break
          case 'fortnightly':
            daysToAdd = 13
            break
          case 'monthly':
            daysToAdd = 27
            break
          default:
            daysToAdd = 6 // Default to weekly
        }

        const nextPeriodEndDate = new Date(nextPeriodStartDate)
        nextPeriodEndDate.setDate(nextPeriodStartDate.getDate() + daysToAdd)

        // Handle subscription end date logic
        let finalPeriodEndDate = nextPeriodEndDate
        let isSubscriptionComplete = false

        if (subscription.end_date) {
          const subscriptionEndDate = new Date(subscription.end_date)
          
          // Condition 1: Subscription already ended
          if (nextPeriodStartDate > subscriptionEndDate) {
            console.log(`Subscription ${subscription.id} already ended, no more periods needed`)
            continue
          }

          // Condition 2: Subscription ends mid-period
          if (subscriptionEndDate >= nextPeriodStartDate && subscriptionEndDate <= nextPeriodEndDate) {
            finalPeriodEndDate = subscriptionEndDate
            isSubscriptionComplete = true
            console.log(`Final period for subscription ${subscription.id}, capped at end date`)
          }
        }

        // Idempotency check - ensure no duplicate periods
        const { data: existingPeriod, error: duplicateCheckError } = await supabase
          .from('subscription_billing_periods')
          .select('id')
          .eq('client_subscription_id', subscription.id)
          .eq('period_start_date', nextPeriodStartDate.toISOString().split('T')[0])
          .limit(1)

        if (duplicateCheckError) {
          console.error(`Error checking for duplicate periods for subscription ${subscription.id}:`, duplicateCheckError)
          continue
        }

        if (existingPeriod && existingPeriod.length > 0) {
          console.log(`Period already exists for subscription ${subscription.id} starting ${nextPeriodStartDate.toISOString().split('T')[0]}`)
          continue
        }

        // Insert new billing period
        const { error: insertError } = await supabase
          .from('subscription_billing_periods')
          .insert({
            client_subscription_id: subscription.id,
            period_start_date: nextPeriodStartDate.toISOString().split('T')[0],
            period_end_date: finalPeriodEndDate.toISOString().split('T')[0],
            amount_due: subscription.billing_amount,
            status: 'due'
          })

        if (insertError) {
          console.error(`Error inserting billing period for subscription ${subscription.id}:`, insertError)
          continue
        }

        periodsCreated++
        console.log(`DEBUG: Generated subsequent billing period: subscriptionId=${subscription.id}, startDate=${nextPeriodStartDate.toISOString().split('T')[0]}, endDate=${finalPeriodEndDate.toISOString().split('T')[0]}, amountDue=${subscription.billing_amount}`)

        if (isSubscriptionComplete) {
          console.log(`Subscription ${subscription.id} processing complete - reached end date`)
        }

      } catch (error) {
        console.error(`Error processing subscription ${subscription.id}:`, error)
        continue
      }
    }

    const result = {
      success: true,
      subscriptionsProcessed,
      periodsCreated,
      timestamp: new Date().toISOString()
    }

    console.log('Recurring billing periods generation completed:', result)

    return new Response(
      JSON.stringify(result),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error('Fatal error in recurring billing periods generation:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})
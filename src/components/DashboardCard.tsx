import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface DashboardCardProps {
  title: string;
  description?: string;
  value?: string | number;
  icon?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'outline' | 'ghost';
  };
  children?: ReactNode;
  className?: string;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
}

export function DashboardCard({
  title,
  description,
  value,
  icon,
  action,
  children,
  className,
  trend
}: DashboardCardProps) {
  return (
    <Card className={cn('card-elevated hover-lift', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-body-small font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {description && (
            <CardDescription className="mt-1">
              {description}
            </CardDescription>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-primary/10 rounded-lg">
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {value && (
          <div className="text-heading-2 font-bold text-foreground mb-2">
            {value}
          </div>
        )}
        
        {trend && (
          <div className="flex items-center space-x-2 text-body-small">
            <span className={cn(
              'font-medium',
              trend.positive ? 'text-success' : 'text-destructive'
            )}>
              {trend.positive ? '+' : ''}{trend.value}%
            </span>
            <span className="text-muted-foreground">
              {trend.label}
            </span>
          </div>
        )}

        {children && (
          <div className="mt-3">
            {children}
          </div>
        )}

        {action && (
          <div className="mt-4">
            <Button 
              variant={action.variant || 'outline'} 
              size="sm"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MetricCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  positive = true
}: {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: ReactNode;
  positive?: boolean;
}) {
  return (
    <Card className="card-elevated">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-body-small font-medium text-muted-foreground">
              {title}
            </p>
            <p className="text-heading-3 font-bold">
              {value}
            </p>
            {change !== undefined && changeLabel && (
              <p className="text-body-small text-muted-foreground mt-1">
                <span className={cn(
                  'font-medium',
                  positive ? 'text-success' : 'text-destructive'
                )}>
                  {positive ? '+' : ''}{change}%
                </span>{' '}
                {changeLabel}
              </p>
            )}
          </div>
          {icon && (
            <div className="p-3 bg-primary/10 rounded-lg">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
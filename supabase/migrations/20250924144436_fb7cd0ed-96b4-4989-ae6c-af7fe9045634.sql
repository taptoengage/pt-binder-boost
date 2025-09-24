-- Add moderator roles for all trainers who don't have roles yet
INSERT INTO user_roles (user_id, role) 
SELECT t.id, 'moderator'::app_role
FROM trainers t
LEFT JOIN user_roles ur ON t.id = ur.user_id AND ur.role = 'moderator'::app_role
WHERE ur.user_id IS NULL;
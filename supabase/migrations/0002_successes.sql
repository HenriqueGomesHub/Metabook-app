-- v1.1: count of correct reviews per card, used to stop mastery inflating after one answer.
alter table card_state add column if not exists successes integer;

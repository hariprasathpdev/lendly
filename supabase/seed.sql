-- Safe local catalog seed. No real student profiles or production records.
insert into public.categories(name,slug) values
 ('Books & notes','books-notes'),('Electronics','electronics'),
 ('Lab equipment','lab-equipment'),('Sports & outdoors','sports-outdoors'),('Other','other')
on conflict(slug) do nothing;

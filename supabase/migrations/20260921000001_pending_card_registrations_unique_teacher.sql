-- pending_card_registrations كان مصمم يكون صف واحد بس لكل مدرس (upsert بـ onConflict:"teacher_id"
-- في 4 دوال مختلفة: teacher-start-new-student-scan, admin-manage-card-registration,
-- manage-card-registration, card-action-mode) لكن الجدول الأصلي (baseline schema) معملوش له
-- أي unique constraint على teacher_id خالص — بس id (auto-generated) هو المفتاح الأساسي. يعني
-- أي upsert بـ onConflict:"teacher_id" كان بيفشل بخطأ Postgres حقيقي ("no unique or exclusion
-- constraint matching the ON CONFLICT specification") في كل مرة، وده اللي ظاهر كـ500 من الواجهة.
alter table pending_card_registrations
  add constraint pending_card_registrations_teacher_id_key unique (teacher_id);

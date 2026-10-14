# -*- coding: utf-8 -*-
"""Remove what is left of the old custom catalogue / RFQ models (<= 19.0.2).

The website now uses standard Odoo Products, Sales quotations and CRM leads.
Odoo already deleted the old models, views and menus during the upgrade, but
it never drops tables nor removes non-updatable records, so do it here once.
"""
import logging

_logger = logging.getLogger(__name__)

OLD_MODELS = (
    'industrial.product', 'industrial.product.category', 'industrial.product.image',
    'industrial.product.size', 'industrial.product.spec', 'industrial.material',
    'industrial.finish', 'industrial.sector', 'industrial.rfq', 'industrial.rfq.line',
)


def migrate(cr, version):
    if not version:
        return

    # Non-updatable data of the old module.
    cr.execute("""
        SELECT id, implementation FROM ir_sequence WHERE code = 'industrial.rfq'
    """)
    for seq_id, implementation in cr.fetchall():
        if implementation == 'standard':
            cr.execute('DROP SEQUENCE IF EXISTS ir_sequence_%03d' % seq_id)
        cr.execute('DROP SEQUENCE IF EXISTS ir_sequence_%03d_001' % seq_id)
        cr.execute('DELETE FROM ir_sequence_date_range WHERE sequence_id = %s', (seq_id,))
        cr.execute('DELETE FROM ir_sequence WHERE id = %s', (seq_id,))
    cr.execute("""
        DELETE FROM mail_template
         WHERE id IN (SELECT res_id FROM ir_model_data
                       WHERE module = 'pnsb_website' AND model = 'mail.template'
                         AND name = 'mail_template_rfq_acknowledgement')
    """)

    # Chatter, followers, activities and files that belonged to old records.
    cr.execute('DELETE FROM mail_message WHERE model IN %s', (OLD_MODELS,))
    cr.execute('DELETE FROM mail_followers WHERE res_model IN %s', (OLD_MODELS,))
    cr.execute('DELETE FROM mail_activity WHERE res_model IN %s', (OLD_MODELS,))
    cr.execute('DELETE FROM ir_attachment WHERE res_model IN %s', (OLD_MODELS,))

    # Record rules of the old models (non-updatable, so Odoo keeps them).
    cr.execute("""
        DELETE FROM ir_rule
         WHERE model_id IN (SELECT id FROM ir_model WHERE model IN %s)
    """, (OLD_MODELS,))

    # External ids of the non-updatable records removed above and of the old
    # catalogue data. Everything else (menus, actions, views, groups, models)
    # keeps its external id: Odoo deletes those records right after this
    # script and needs the ids to find them.
    cr.execute("""
        DELETE FROM ir_model_data
         WHERE module = 'pnsb_website'
           AND (model IN %s
                OR (model = 'ir.rule' AND res_id NOT IN (SELECT id FROM ir_rule))
                OR (model = 'ir.sequence' AND res_id NOT IN (SELECT id FROM ir_sequence))
                OR (model = 'mail.template' AND res_id NOT IN (SELECT id FROM mail_template)))
    """, (OLD_MODELS,))

    # Finally the tables themselves (and their many2many relations).
    cr.execute("""
        SELECT tablename FROM pg_tables
         WHERE schemaname = current_schema() AND tablename LIKE 'industrial\\_%%'
    """)
    tables = [row[0] for row in cr.fetchall()]
    for table in tables:
        cr.execute('DROP TABLE IF EXISTS "%s" CASCADE' % table)
    _logger.info('pnsb_website: removed old catalogue/RFQ tables: %s', ', '.join(tables) or '-')

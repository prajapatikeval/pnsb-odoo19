FROM odoo:19.0
USER root
COPY addons /mnt/extra-addons
COPY odoo.conf /etc/odoo/odoo.conf
COPY start.sh /start.sh
RUN chmod +x /start.sh && chown -R odoo:odoo /mnt/extra-addons /etc/odoo/odoo.conf /start.sh
USER odoo
ENTRYPOINT ["/start.sh"]

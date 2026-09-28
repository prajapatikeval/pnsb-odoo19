# Odoo 19 + PNSB website, tuned for Render.
FROM odoo:19.0

USER root
COPY --chown=odoo:odoo addons /mnt/extra-addons
COPY --chown=odoo:odoo docker/boot.py /opt/pnsb/boot.py
RUN chmod 0755 /opt/pnsb/boot.py \
    && find /mnt/extra-addons -name "__pycache__" -prune -exec rm -rf {} +
USER odoo

ENV PORT=10000
EXPOSE 10000

# boot.py answers health checks right away, prepares the database/modules,
# then replaces itself with the Odoo server.
ENTRYPOINT ["python3", "/opt/pnsb/boot.py"]

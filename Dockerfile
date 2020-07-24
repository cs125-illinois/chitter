FROM phusion/baseimage

CMD ["/sbin/my_init"]

RUN curl -sL https://deb.nodesource.com/setup_12.x | bash -
RUN apt-get -y install nodejs

RUN mkdir /server
COPY server/dist/index.js /server
COPY container/etc/service/server/run /etc/service/server/run
RUN chmod +x /etc/service/server/run

RUN apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ARG BUILD_DATE
ARG GIT_COMMIT
ARG npm_package_image
ARG npm_package_description
ARG npm_package_homepage
ARG npm_package_repository_url
ARG npm_package_version
LABEL org.label-schema.build-date=$BUILD_DATE \
	org.label-schema.name=$npm_package_image \
	org.label-schema.description=$npm_package_description \
	org.label-schema.url=$npm_package_homepage \
	org.label-schema.vcs-ref=$GIT_COMMIT \
	org.label-schema.vcs-url=$npm_package_repository_url \
	org.label-schema.vendor="CS 125 @ Illinois" \
	org.label-schema.version=$npm_package_version \
	org.label-schema.schema-version="1.0"
